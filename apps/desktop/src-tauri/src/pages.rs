use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::article::validate_slug;
use crate::db::Db;

pub const TITLE_MAX: usize = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: i64,
    pub site_id: i64,
    pub title: String,
    pub slug: String,
    pub content: String,
    pub show_in_nav: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

const PAGE_COLS: &str =
    "id, site_id, title, slug, content, show_in_nav, sort_order, created_at, updated_at";

fn row_to_page(row: &rusqlite::Row) -> rusqlite::Result<Page> {
    Ok(Page {
        id: row.get(0)?,
        site_id: row.get(1)?,
        title: row.get(2)?,
        slug: row.get(3)?,
        content: row.get(4)?,
        show_in_nav: row.get::<_, i64>(5)? != 0,
        sort_order: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub fn get_page(conn: &Connection, id: i64) -> Result<Page, String> {
    conn.query_row(
        &format!("SELECT {PAGE_COLS} FROM pages WHERE id = ?1"),
        params![id],
        row_to_page,
    )
    .map_err(|_| format!("页面不存在: {id}"))
}

pub fn get_pages_by_site(conn: &Connection, site_id: i64) -> Result<Vec<Page>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {PAGE_COLS} FROM pages WHERE site_id = ?1 ORDER BY sort_order, id"
        ))
        .map_err(|e| format!("查询页面失败: {e}"))?;
    let rows = stmt
        .query_map(params![site_id], row_to_page)
        .map_err(|e| format!("查询页面失败: {e}"))?;
    rows.collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| format!("读取页面失败: {e}"))
}

/// 新建页面；页面 slug 必填（用于生成路由路径）
pub fn insert_page(
    conn: &Connection,
    site_id: i64,
    title: &str,
    slug: &str,
) -> Result<Page, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("页面标题不能为空".into());
    }
    if title.chars().count() > TITLE_MAX {
        return Err(format!("页面标题不能超过 {TITLE_MAX} 个字符"));
    }
    let slug = validate_slug(slug)?;
    let taken: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pages WHERE site_id = ?1 AND slug = ?2)",
            params![site_id, slug],
            |row| row.get(0),
        )
        .map_err(|e| format!("查询页面失败: {e}"))?;
    if taken {
        return Err(format!("slug 已被使用: {slug}"));
    }
    conn.execute(
        "INSERT INTO pages (site_id, title, slug) VALUES (?1, ?2, ?3)",
        params![site_id, title, slug],
    )
    .map_err(|e| format!("创建页面失败: {e}"))?;
    get_page(conn, conn.last_insert_rowid())
}

/// 全量保存页面
pub fn update_page(
    conn: &Connection,
    id: i64,
    title: &str,
    content: &str,
    slug: &str,
    show_in_nav: bool,
) -> Result<Page, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("页面标题不能为空".into());
    }
    if title.chars().count() > TITLE_MAX {
        return Err(format!("页面标题不能超过 {TITLE_MAX} 个字符"));
    }
    let slug = validate_slug(slug)?;
    let current = get_page(conn, id)?;
    if slug != current.slug {
        let taken: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pages WHERE site_id = ?1 AND slug = ?2 AND id != ?3)",
                params![current.site_id, slug, id],
                |row| row.get(0),
            )
            .map_err(|e| format!("查询页面失败: {e}"))?;
        if taken {
            return Err(format!("slug 已被使用: {slug}"));
        }
    }
    conn.execute(
        "UPDATE pages SET title = ?1, content = ?2, slug = ?3, show_in_nav = ?4,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?5",
        params![title, content, slug, show_in_nav as i64, id],
    )
    .map_err(|e| format!("保存页面失败: {e}"))?;
    get_page(conn, id)
}

pub fn delete_page(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM pages WHERE id = ?1", params![id])
        .map_err(|e| format!("删除页面失败: {e}"))?;
    Ok(())
}

// ===== Tauri commands =====

#[tauri::command]
pub fn list_pages(db: State<Db>, site_id: i64) -> Result<Vec<Page>, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_pages_by_site(&conn, site_id)
}

#[tauri::command]
pub fn get_page_cmd(db: State<Db>, id: i64) -> Result<Page, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_page(&conn, id)
}

#[tauri::command]
pub fn create_page(
    db: State<Db>,
    site_id: i64,
    title: String,
    slug: String,
) -> Result<Page, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    insert_page(&conn, site_id, &title, &slug)
}

#[tauri::command]
pub fn update_page_cmd(
    db: State<Db>,
    id: i64,
    title: String,
    content: String,
    slug: String,
    show_in_nav: bool,
) -> Result<Page, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    update_page(&conn, id, &title, &content, &slug, show_in_nav)
}

#[tauri::command]
pub fn delete_page_cmd(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    delete_page(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;
    use crate::site::insert_site;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn page_crud_and_slug_rules() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();

        let p = insert_page(&conn, site.id, "  关于我  ", "  About ").unwrap();
        assert_eq!(p.title, "关于我");
        assert_eq!(p.slug, "about");
        assert!(p.show_in_nav);

        insert_page(&conn, site.id, "友链", "links").unwrap();

        let list = get_pages_by_site(&conn, site.id).unwrap();
        assert_eq!(list.len(), 2);

        // slug 冲突
        assert!(insert_page(&conn, site.id, "又一个关于", "about").is_err());

        // 全量保存 + show_in_nav
        let updated = update_page(&conn, p.id, "关于", "页面内容", "about-me", false).unwrap();
        assert_eq!(updated.slug, "about-me");
        assert!(!updated.show_in_nav);
        assert_eq!(updated.content, "页面内容");

        // 标题必填 / slug 格式
        assert!(update_page(&conn, p.id, "  ", "x", "about-me", true).is_err());
        assert!(update_page(&conn, p.id, "关于", "x", "非法 slug", true).is_err());

        delete_page(&conn, p.id).unwrap();
        assert!(get_page(&conn, p.id).is_err());
        assert_eq!(get_pages_by_site(&conn, site.id).unwrap().len(), 1);
    }
}
