use std::sync::Mutex;

use rusqlite::{params, Connection};
use tauri::Manager;

/// SQLite 连接，包装为 Tauri 全局状态
pub struct Db(pub Mutex<Connection>);

/// 所有建表迁移，幂等，应用启动时执行
const MIGRATIONS: &str = "
CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (site_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_site ON categories(site_id);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (site_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tags_site ON tags(site_id);
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_articles_site ON articles(site_id);
CREATE TABLE IF NOT EXISTS article_tags (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);
CREATE TABLE IF NOT EXISTS article_categories (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, category_id)
);
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_media_site ON media(site_id);
CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    show_in_nav INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (site_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_pages_site ON pages(site_id);
";

/// 判断 SQLite 错误是否为唯一约束冲突（slug/名称重名等）
pub fn is_unique_conflict(e: &rusqlite::Error) -> bool {
    matches!(
        e,
        rusqlite::Error::SqliteFailure(_, Some(msg)) if msg.contains("UNIQUE")
    )
}

/// 执行全部迁移（幂等）；生产初始化与内存库测试共用
pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    // 让 FOREIGN KEY / ON DELETE 行为真正生效（SQLite 默认关闭）
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| format!("开启外键约束失败: {e}"))?;
    conn.execute_batch(MIGRATIONS).map_err(|e| format!("执行迁移失败: {e}"))?;

    // 旧库迁移：单分类列（category_id）迁入关联表后删除。
    // 新库无该列，直接跳过；列已删除后重复执行同样跳过。
    let has_category_col: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('articles') WHERE name = 'category_id'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("检查表结构失败: {e}"))?;
    if has_category_col {
        conn.execute(
            "INSERT OR IGNORE INTO article_categories (article_id, category_id)
             SELECT id, category_id FROM articles WHERE category_id IS NOT NULL",
            [],
        )
        .map_err(|e| format!("迁移旧分类数据失败: {e}"))?;
        conn.execute("ALTER TABLE articles DROP COLUMN category_id", [])
            .map_err(|e| format!("移除旧分类列失败: {e}"))?;
    }

    // slug 列：建表语句统一不含 slug，新旧库都走补列 + 回填 + 唯一索引
    let has_slug: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('articles') WHERE name = 'slug'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("检查表结构失败: {e}"))?;
    if !has_slug {
        conn.execute("ALTER TABLE articles ADD COLUMN slug TEXT", [])
            .map_err(|e| format!("添加 slug 列失败: {e}"))?;
    }
    // 回填：NULL（老库新增列）与旧版自动生成的 post-{id} 数字 slug
    // 一并迁移为随机字母串
    let need_backfill: Vec<i64> = {
        let mut stmt = conn
            .prepare(
                "SELECT id FROM articles
                 WHERE slug IS NULL OR slug GLOB 'post-[0-9]*'",
            )
            .map_err(|e| format!("检查 slug 失败: {e}"))?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("检查 slug 失败: {e}"))?;
        rows.collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("读取 slug 失败: {e}"))?
    };
    for id in need_backfill {
        for _ in 0..5 {
            let slug = crate::article::generate_slug();
            let updated = conn.execute(
                "UPDATE articles SET slug = ?1 WHERE id = ?2",
                params![slug, id],
            );
            match updated {
                Ok(_) => break,
                Err(e) if is_unique_conflict(&e) => continue, // 撞 slug 重试
                Err(e) => return Err(format!("回填 slug 失败: {e}")),
            }
        }
    }
    conn.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_site_slug ON articles(site_id, slug);",
    )
    .map_err(|e| format!("创建 slug 索引失败: {e}"))?;

    // 内容格式迁移（一次性）：编辑器切换为 Tiptap 后内容统一存 HTML，
    // 存量 markdown 在此转换为 HTML
    let content_migrated = crate::site::get_setting(conn, "content_html_migrated")
        .map_err(|e| format!("检查内容迁移状态失败: {e}"))?
        .is_some();
    if !content_migrated {
        let rows: Vec<(i64, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, content FROM articles")
                .map_err(|e| format!("读取文章失败: {e}"))?;
            let rows = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| format!("读取文章失败: {e}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("读取文章失败: {e}"))?
        };
        for (id, content) in rows {
            let html = crate::article::markdown_to_html(&content);
            conn.execute(
                "UPDATE articles SET content = ?1 WHERE id = ?2",
                params![html, id],
            )
            .map_err(|e| format!("迁移文章内容失败: {e}"))?;
        }
        crate::site::set_setting(conn, "content_html_migrated", "1")
            .map_err(|e| format!("记录内容迁移状态失败: {e}"))?;
    }
    Ok(())
}

/// 在应用数据目录初始化数据库并执行迁移
pub fn init_db(app: &tauri::AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let conn = Connection::open(dir.join("wordma.db"))?;
    run_migrations(&conn)?;
    Ok(conn)
}
