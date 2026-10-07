use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

pub const STATUS_DRAFT: &str = "draft";
pub const STATUS_PUBLISHED: &str = "published";

/// markdown → HTML（存量内容一次性迁移用；新内容已是 HTML）
pub fn markdown_to_html(md: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let parser = Parser::new_ext(md, Options::all());
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

/// HTML 文本长度：剥掉标签后的非空白字符数（字数统计口径与前端一致）
pub fn html_text_len(html: &str) -> usize {
    let mut text = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(c),
            _ => {}
        }
    }
    text.chars().filter(|c| !c.is_whitespace()).count()
}

/// 文章关联的分类/标签引用（载荷里只带 id 与名称）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleRef {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub id: i64,
    pub site_id: i64,
    pub slug: String,
    pub title: String,
    pub content: String,
    pub status: String,
    pub categories: Vec<ArticleRef>,
    pub tags: Vec<ArticleRef>,
    pub created_at: String,
    pub updated_at: String,
}

/// 文章基础列（分类/标签由单独查询附加）
const ARTICLE_COLS: &str =
    "a.id, a.site_id, a.slug, a.title, a.content, a.status, a.created_at, a.updated_at";

struct ArticleRow {
    id: i64,
    site_id: i64,
    slug: String,
    title: String,
    content: String,
    status: String,
    created_at: String,
    updated_at: String,
}

fn row_to_article_row(row: &rusqlite::Row) -> rusqlite::Result<ArticleRow> {
    Ok(ArticleRow {
        id: row.get(0)?,
        site_id: row.get(1)?,
        slug: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

/// 按文章批量加载关联引用（tags / categories 共用同一形态的关联查询）
fn load_refs_for_articles(
    conn: &Connection,
    query: &str,
    article_ids: &[i64],
) -> Result<HashMap<i64, Vec<ArticleRef>>, String> {
    let mut map: HashMap<i64, Vec<ArticleRef>> = HashMap::new();
    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("查询文章关联失败: {e}"))?;
    for id in article_ids {
        let rows = stmt
            .query_map(params![id], |row| {
                Ok(ArticleRef {
                    id: row.get(1)?,
                    name: row.get(2)?,
                })
            })
            .map_err(|e| format!("查询文章关联失败: {e}"))?;
        let refs = rows
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| format!("读取文章关联失败: {e}"))?;
        map.insert(*id, refs);
    }
    Ok(map)
}

const TAGS_QUERY: &str =
    "SELECT at.article_id, t.id, t.name FROM article_tags at
     JOIN tags t ON t.id = at.tag_id WHERE at.article_id = ?1 ORDER BY t.name";
const CATEGORIES_QUERY: &str =
    "SELECT ac.article_id, c.id, c.name FROM article_categories ac
     JOIN categories c ON c.id = ac.category_id WHERE ac.article_id = ?1 ORDER BY c.name";

fn finish_articles(
    conn: &Connection,
    rows: Vec<ArticleRow>,
) -> Result<Vec<Article>, String> {
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    let tags_map = load_refs_for_articles(conn, TAGS_QUERY, &ids)?;
    let categories_map = load_refs_for_articles(conn, CATEGORIES_QUERY, &ids)?;
    Ok(rows
        .into_iter()
        .map(|r| {
            Article {
                id: r.id,
                site_id: r.site_id,
                slug: r.slug,
                title: r.title,
                content: r.content,
                status: r.status,
                categories: categories_map.get(&r.id).cloned().unwrap_or_default(),
                tags: tags_map.get(&r.id).cloned().unwrap_or_default(),
                created_at: r.created_at,
                updated_at: r.updated_at,
            }
        })
        .collect())
}

fn is_valid_status(status: &str) -> bool {
    status == STATUS_DRAFT || status == STATUS_PUBLISHED
}

/// 站点下新建文章；标题允许为空（编辑器里再起名）
pub fn insert_article(
    conn: &Connection,
    site_id: i64,
    title: &str,
) -> Result<Article, String> {
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sites WHERE id = ?1)",
            params![site_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("查询站点失败: {e}"))?;
    if !exists {
        return Err(format!("站点不存在: {site_id}"));
    }
    // 随机 slug 撞唯一索引时重试（8 位字母空间约 2000 亿，实际几乎不会发生）
    for _ in 0..5 {
        let slug = generate_slug();
        let inserted = conn.execute(
            "INSERT INTO articles (site_id, title, slug) VALUES (?1, ?2, ?3)",
            params![site_id, title.trim(), slug],
        );
        match inserted {
            Ok(_) => return get_article(conn, conn.last_insert_rowid()),
            Err(e) if crate::db::is_unique_conflict(&e) => continue,
            Err(e) => return Err(format!("创建文章失败: {e}")),
        }
    }
    Err("生成 slug 失败，请重试".into())
}

pub fn get_article(conn: &Connection, id: i64) -> Result<Article, String> {
    conn.query_row(
        &format!("SELECT {ARTICLE_COLS} FROM articles a WHERE a.id = ?1"),
        params![id],
        row_to_article_row,
    )
    .map_err(|_| format!("文章不存在: {id}"))
    .and_then(|row| finish_articles(conn, vec![row]))
    .map(|mut list| list.remove(0))
}

/// 站点文章列表，按更新时间倒序
pub fn get_articles_by_site(conn: &Connection, site_id: i64) -> Result<Vec<Article>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ARTICLE_COLS} FROM articles a
             WHERE a.site_id = ?1 ORDER BY a.updated_at DESC, a.id DESC"
        ))
        .map_err(|e| format!("查询文章失败: {e}"))?;
    let rows = stmt
        .query_map(params![site_id], row_to_article_row)
        .map_err(|e| format!("查询文章失败: {e}"))?;
    let rows = rows
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| format!("读取文章失败: {e}"))?;
    finish_articles(conn, rows)
}

/// 自动生成 slug：8 位小写字母的随机串（不含数字）
pub fn generate_slug() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| rng.gen_range(b'a'..=b'z') as char)
        .collect()
}

/// slug 规则：小写字母/数字/中划线，不允许首尾中划线（文章与独立页面共用）
pub fn validate_slug(slug: &str) -> Result<String, String> {
    let slug = slug.trim().to_lowercase();
    let ok = !slug.is_empty()
        && slug.len() <= 80
        && slug
            .split('-')
            .all(|seg| !seg.is_empty() && seg.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    if !ok {
        return Err("slug 只能包含小写字母、数字和中划线".into());
    }
    Ok(slug)
}

/// 全量保存文章（标题/正文/状态/slug/分类/标签）；标题允许为空，
/// 分类与标签均为全量替换，且必须属于文章所在站点
pub fn update_article(
    conn: &Connection,
    id: i64,
    title: Option<&str>,
    content: Option<&str>,
    status: Option<&str>,
    slug: Option<&str>,
    category_ids: &[i64],
    tag_ids: &[i64],
) -> Result<Article, String> {
    let current = get_article(conn, id)?;
    let title = title.map(str::trim).unwrap_or(&current.title);
    let content = content.unwrap_or(&current.content);
    let status = status.unwrap_or(&current.status);
    if !is_valid_status(status) {
        return Err(format!("未知的状态: {status}"));
    }
    let slug = match slug {
        Some(s) => validate_slug(s)?,
        None => current.slug.clone(),
    };
    if slug != current.slug {
        let taken: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM articles WHERE site_id = ?1 AND slug = ?2 AND id != ?3)",
                params![current.site_id, slug, id],
                |row| row.get(0),
            )
            .map_err(|e| format!("查询 slug 失败: {e}"))?;
        if taken {
            return Err(format!("slug 已被使用: {slug}"));
        }
    }
    // 分类/标签须存在且属于文章所在站点
    for (ids, table, label) in [
        (category_ids, "categories", "分类"),
        (tag_ids, "tags", "标签"),
    ] {
        for tid in ids {
            let owner_site: Option<i64> = conn
                .query_row(
                    &format!("SELECT site_id FROM {table} WHERE id = ?1"),
                    params![tid],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("查询{label}失败: {e}"))?;
            match owner_site {
                Some(sid) if sid == current.site_id => {}
                _ => return Err(format!("{label}不存在: {tid}")),
            }
        }
    }

    conn.execute(
        "UPDATE articles SET title = ?1, content = ?2, status = ?3, slug = ?4,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?5",
        params![title, content, status, slug, id],
    )
    .map_err(|e| format!("保存文章失败: {e}"))?;

    // 关联为全量替换
    for (ids, table, column) in [
        (category_ids, "article_categories", "category_id"),
        (tag_ids, "article_tags", "tag_id"),
    ] {
        conn.execute(&format!("DELETE FROM {table} WHERE article_id = ?1"), params![id])
            .map_err(|e| format!("保存文章失败: {e}"))?;
        for rid in ids {
            conn.execute(
                &format!("INSERT OR IGNORE INTO {table} (article_id, {column}) VALUES (?1, ?2)"),
                params![id, rid],
            )
            .map_err(|e| format!("保存文章失败: {e}"))?;
        }
    }

    get_article(conn, id)
}

pub fn delete_article(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM articles WHERE id = ?1", params![id])
        .map_err(|e| format!("删除文章失败: {e}"))?;
    Ok(())
}

// ===== Tauri commands =====

#[tauri::command]
pub fn list_articles(db: State<Db>, site_id: i64) -> Result<Vec<Article>, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_articles_by_site(&conn, site_id)
}

#[tauri::command]
pub fn get_article_cmd(db: State<Db>, id: i64) -> Result<Article, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_article(&conn, id)
}

#[tauri::command]
pub fn create_article(
    db: State<Db>,
    site_id: i64,
    title: String,
) -> Result<Article, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    insert_article(&conn, site_id, &title)
}

#[tauri::command]
pub fn update_article_cmd(
    db: State<Db>,
    id: i64,
    title: Option<String>,
    content: Option<String>,
    status: Option<String>,
    slug: Option<String>,
    category_ids: Vec<i64>,
    tag_ids: Vec<i64>,
) -> Result<Article, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    update_article(
        &conn,
        id,
        title.as_deref(),
        content.as_deref(),
        status.as_deref(),
        slug.as_deref(),
        &category_ids,
        &tag_ids,
    )
}

#[tauri::command]
pub fn delete_article_cmd(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    delete_article(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
        use crate::site::insert_site;
    use crate::taxonomy::{insert_category, insert_tag};

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn create_list_update_delete() {
        let conn = mem_db();
        let site = insert_site(&conn, "测试站", None).unwrap();

        let a = insert_article(&conn, site.id, "  第一篇 ").unwrap();
        assert_eq!(a.title, "第一篇");
        assert_eq!(a.status, STATUS_DRAFT);
        assert_eq!(a.content, "");
        // 自动生成 slug：8 位小写字母、无数字
        assert_eq!(a.slug.len(), 8);
        assert!(a.slug.chars().all(|c| c.is_ascii_lowercase()));
        assert!(a.tags.is_empty());
        assert!(a.categories.is_empty());

        let b = insert_article(&conn, site.id, "").unwrap();
        update_article(
            &conn,
            b.id,
            Some("第二篇"),
            Some("正文内容"),
            Some(STATUS_PUBLISHED),
            None,
            &[],
            &[],
        )
        .unwrap();

        let list = get_articles_by_site(&conn, site.id).unwrap();
        assert_eq!(list.len(), 2);
        // 最近更新的在前
        assert_eq!(list[0].title, "第二篇");
        assert_eq!(list[0].status, STATUS_PUBLISHED);
        assert!(list[0].updated_at >= list[1].updated_at);

        delete_article(&conn, a.id).unwrap();
        assert_eq!(get_articles_by_site(&conn, site.id).unwrap().len(), 1);
        assert!(get_article(&conn, a.id).is_err());
    }

    #[test]
    fn partial_update_keeps_other_fields() {
        let conn = mem_db();
        let site = insert_site(&conn, "测试站", None).unwrap();
        let a = insert_article(&conn, site.id, "标题").unwrap();
        update_article(&conn, a.id, None, Some("只改正文"), None, None, &[], &[]).unwrap();
        let reloaded = get_article(&conn, a.id).unwrap();
        assert_eq!(reloaded.title, "标题");
        assert_eq!(reloaded.content, "只改正文");
        assert_eq!(reloaded.status, STATUS_DRAFT);
    }

    #[test]
    fn taxonomy_roundtrip() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();
        let c1 = insert_category(&conn, site.id, "户外").unwrap();
        let c2 = insert_category(&conn, site.id, "随笔").unwrap();
        let t1 = insert_tag(&conn, site.id, "徒步").unwrap();
        let t2 = insert_tag(&conn, site.id, "露营").unwrap();
        let a = insert_article(&conn, site.id, "山中一日").unwrap();

        // 一篇文章可以有多个分类
        update_article(
            &conn,
            a.id,
            None,
            None,
            None,
            None,
            &[c2.id, c1.id],
            &[t2.id, t1.id],
        )
        .unwrap();

        let reloaded = get_article(&conn, a.id).unwrap();
        let cat_names: Vec<&str> = reloaded.categories.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(cat_names, vec!["户外", "随笔"]); // 按名称排序，与传入顺序无关
        let tag_names: Vec<&str> = reloaded.tags.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(tag_names, vec!["徒步", "露营"]);

        // 重复关联只保留一份
        update_article(&conn, a.id, None, None, None, None, &[c1.id, c1.id], &[t1.id]).unwrap();
        let reloaded = get_article(&conn, a.id).unwrap();
        assert_eq!(reloaded.categories.len(), 1);
        assert_eq!(reloaded.tags.len(), 1);

        // 全量替换语义：清空分类
        update_article(&conn, a.id, None, None, None, None, &[], &[t1.id]).unwrap();
        let reloaded = get_article(&conn, a.id).unwrap();
        assert!(reloaded.categories.is_empty());
        assert_eq!(reloaded.tags.len(), 1);

        // 跨站点的分类/标签被拒绝
        let s2 = insert_site(&conn, "另一个站", None).unwrap();
        let foreign_tag = insert_tag(&conn, s2.id, "外部标签").unwrap();
        assert!(update_article(&conn, a.id, None, None, None, None, &[], &[foreign_tag.id]).is_err());
        let foreign_cat = insert_category(&conn, s2.id, "外部分类").unwrap();
        assert!(update_article(&conn, a.id, None, None, None, None, &[foreign_cat.id], &[]).is_err());
    }

    #[test]
    fn slug_auto_generate_validate_and_conflict() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();
        let a = insert_article(&conn, site.id, "山中一日").unwrap();
        // 默认 slug：8 位随机小写字母
        assert_eq!(a.slug.len(), 8);
        assert!(a.slug.chars().all(|c| c.is_ascii_lowercase()));

        // 合法修改 + 大写归一化
        let renamed = update_article(
            &conn,
            a.id,
            None,
            None,
            None,
            Some("  Mountain-Day  "),
            &[],
            &[],
        )
        .unwrap();
        assert_eq!(renamed.slug, "mountain-day");

        // 非法字符
        assert!(update_article(&conn, a.id, None, None, None, Some("中文slug"), &[], &[]).is_err());
        assert!(update_article(&conn, a.id, None, None, None, Some("-bad-"), &[], &[]).is_err());

        // 与同站其他文章冲突
        let b = insert_article(&conn, site.id, "另一篇").unwrap();
        assert!(update_article(&conn, b.id, None, None, None, Some("mountain-day"), &[], &[]).is_err());
        // 保留原 slug 的保存不受影响
        let kept = update_article(&conn, b.id, Some("标题B"), None, None, Some("post-2"), &[], &[]).unwrap();
        assert_eq!(kept.slug, "post-2");
    }

    #[test]
    fn site_isolation_and_validation() {
        let conn = mem_db();
        let s1 = insert_site(&conn, "站点一", None).unwrap();
        let s2 = insert_site(&conn, "站点二", None).unwrap();
        let a = insert_article(&conn, s1.id, "属于站点一").unwrap();
        assert!(get_articles_by_site(&conn, s2.id).unwrap().is_empty());

        assert!(insert_article(&conn, 999, "孤儿文章").is_err());
        assert!(update_article(&conn, a.id, None, None, Some("archived"), None, &[], &[]).is_err());
    }
}
