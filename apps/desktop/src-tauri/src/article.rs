use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

pub const STATUS_DRAFT: &str = "draft";
pub const STATUS_PUBLISHED: &str = "published";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub id: i64,
    pub site_id: i64,
    pub title: String,
    pub content: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

const ARTICLE_COLS: &str = "id, site_id, title, content, status, created_at, updated_at";

fn row_to_article(row: &rusqlite::Row) -> rusqlite::Result<Article> {
    Ok(Article {
        id: row.get(0)?,
        site_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        status: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
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
    conn.execute(
        "INSERT INTO articles (site_id, title) VALUES (?1, ?2)",
        params![site_id, title.trim()],
    )
    .map_err(|e| format!("创建文章失败: {e}"))?;
    get_article(conn, conn.last_insert_rowid())
}

pub fn get_article(conn: &Connection, id: i64) -> Result<Article, String> {
    conn.query_row(
        &format!("SELECT {ARTICLE_COLS} FROM articles WHERE id = ?1"),
        params![id],
        row_to_article,
    )
    .map_err(|e| format!("文章不存在: {e}"))
}

/// 站点文章列表，按更新时间倒序
pub fn get_articles_by_site(conn: &Connection, site_id: i64) -> Result<Vec<Article>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {ARTICLE_COLS} FROM articles WHERE site_id = ?1 ORDER BY updated_at DESC, id DESC"
        ))
        .map_err(|e| format!("查询文章失败: {e}"))?;
    let rows = stmt
        .query_map(params![site_id], row_to_article)
        .map_err(|e| format!("查询文章失败: {e}"))?;
    rows.collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| format!("读取文章失败: {e}"))
}

/// 部分更新文章；只处理传入的字段，标题允许为空，时间戳自动刷新
pub fn update_article(
    conn: &Connection,
    id: i64,
    title: Option<&str>,
    content: Option<&str>,
    status: Option<&str>,
) -> Result<Article, String> {
    let current = get_article(conn, id)?;
    let title = title.map(str::trim).unwrap_or(&current.title);
    let content = content.unwrap_or(&current.content);
    let status = status.unwrap_or(&current.status);
    if !is_valid_status(status) {
        return Err(format!("未知的状态: {status}"));
    }
    conn.execute(
        "UPDATE articles SET title = ?1, content = ?2, status = ?3,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?4",
        params![title, content, status, id],
    )
    .map_err(|e| format!("保存文章失败: {e}"))?;
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
) -> Result<Article, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    update_article(&conn, id, title.as_deref(), content.as_deref(), status.as_deref())
}

#[tauri::command]
pub fn delete_article_cmd(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    delete_article(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MIGRATIONS;
    use crate::site::insert_site;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATIONS).unwrap();
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

        let b = insert_article(&conn, site.id, "").unwrap();
        update_article(&conn, b.id, Some("第二篇"), Some("正文内容"), Some(STATUS_PUBLISHED))
            .unwrap();

        let list = get_articles_by_site(&conn, site.id).unwrap();
        assert_eq!(list.len(), 2);
        // 最近更新的在前
        assert_eq!(list[0].title, "第二篇");
        assert_eq!(list[0].status, STATUS_PUBLISHED);
        assert!(list[0].updated_at >= list[1].updated_at);

        // 更新时间被刷新（毫秒精度，同毫秒内允许相等）
        assert!(list[0].updated_at >= b.updated_at);

        delete_article(&conn, a.id).unwrap();
        assert_eq!(get_articles_by_site(&conn, site.id).unwrap().len(), 1);
        assert!(get_article(&conn, a.id).is_err());
    }

    #[test]
    fn partial_update_keeps_other_fields() {
        let conn = mem_db();
        let site = insert_site(&conn, "测试站", None).unwrap();
        let a = insert_article(&conn, site.id, "标题").unwrap();
        update_article(&conn, a.id, None, Some("只改正文"), None).unwrap();
        let reloaded = get_article(&conn, a.id).unwrap();
        assert_eq!(reloaded.title, "标题");
        assert_eq!(reloaded.content, "只改正文");
        assert_eq!(reloaded.status, STATUS_DRAFT);
    }

    #[test]
    fn site_isolation_and_validation() {
        let conn = mem_db();
        let s1 = insert_site(&conn, "站点一", None).unwrap();
        let s2 = insert_site(&conn, "站点二", None).unwrap();
        let a = insert_article(&conn, s1.id, "属于站点一").unwrap();
        assert!(get_articles_by_site(&conn, s2.id).unwrap().is_empty());

        assert!(insert_article(&conn, 999, "孤儿文章").is_err());
        assert!(update_article(&conn, a.id, None, None, Some("archived")).is_err());
    }
}
