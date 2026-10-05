use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
}

/// settings 表中记录当前激活站点的键
pub const ACTIVE_SITE_KEY: &str = "active_site_id";

fn row_to_site(row: &rusqlite::Row) -> rusqlite::Result<Site> {
    Ok(Site {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
    })
}

/// 插入站点；name/description 规范化：去除首尾空白，空白描述存为 NULL
pub fn insert_site(
    conn: &Connection,
    name: &str,
    description: Option<&str>,
) -> Result<Site, rusqlite::Error> {
    let name = name.trim();
    let description = description.map(str::trim).filter(|d| !d.is_empty());
    conn.execute(
        "INSERT INTO sites (name, description) VALUES (?1, ?2)",
        params![name, description],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, name, description, created_at FROM sites WHERE id = ?1",
        params![id],
        row_to_site,
    )
}

pub fn get_all_sites(conn: &Connection) -> Result<Vec<Site>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT id, name, description, created_at FROM sites ORDER BY id")?;
    let rows = stmt.query_map([], row_to_site)?;
    rows.collect()
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// 读取当前激活站点 ID；未设置或值不合法时返回 None
pub fn get_active_site_id(conn: &Connection) -> Result<Option<i64>, rusqlite::Error> {
    match get_setting(conn, ACTIVE_SITE_KEY)? {
        Some(v) => Ok(v.parse::<i64>().ok()),
        None => Ok(None),
    }
}

/// 设置当前激活站点；站点不存在时报错
pub fn set_active_site_id(conn: &Connection, site_id: i64) -> Result<(), String> {
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
    set_setting(conn, ACTIVE_SITE_KEY, &site_id.to_string())
        .map_err(|e| format!("保存激活站点失败: {e}"))
}

// ===== Tauri commands =====

#[tauri::command]
pub fn list_sites(db: State<Db>) -> Result<Vec<Site>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_all_sites(&conn).map_err(|e| format!("查询站点失败: {e}"))
}

#[tauri::command]
pub fn create_site(db: State<Db>, name: String, description: Option<String>) -> Result<Site, String> {
    if name.trim().is_empty() {
        return Err("站点名称不能为空".into());
    }
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("数据库连接不可用: {e}"))?;
    insert_site(&conn, &name, description.as_deref())
        .map_err(|e| format!("创建站点失败: {e}"))
}

#[tauri::command]
pub fn get_active_site(db: State<Db>) -> Result<Option<i64>, String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_active_site_id(&conn).map_err(|e| format!("查询激活站点失败: {e}"))
}

#[tauri::command]
pub fn set_active_site(db: State<Db>, site_id: i64) -> Result<(), String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("数据库连接不可用: {e}"))?;
    set_active_site_id(&conn, site_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MIGRATIONS;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATIONS).unwrap();
        conn
    }

    #[test]
    fn create_then_list() {
        let conn = mem_db();
        let first = insert_site(&conn, "  我的博客  ", Some(" 简介 ")).unwrap();
        assert!(first.id > 0);
        assert_eq!(first.name, "我的博客");
        assert_eq!(first.description.as_deref(), Some("简介"));

        insert_site(&conn, "第二个", None).unwrap();

        let sites = get_all_sites(&conn).unwrap();
        assert_eq!(sites.len(), 2);
        assert_eq!(sites[0].name, "我的博客");
        assert_eq!(sites[1].name, "第二个");
    }

    #[test]
    fn blank_description_stored_as_null() {
        let conn = mem_db();
        let site = insert_site(&conn, "a", Some("   ")).unwrap();
        assert!(site.description.is_none());
    }

    #[test]
    fn active_site_roundtrip_and_validation() {
        let conn = mem_db();
        // 未设置时为 None
        assert_eq!(get_active_site_id(&conn).unwrap(), None);

        let a = insert_site(&conn, "A", None).unwrap();
        set_active_site_id(&conn, a.id).unwrap();
        assert_eq!(get_active_site_id(&conn).unwrap(), Some(a.id));

        // 重复设置覆盖旧值
        let b = insert_site(&conn, "B", None).unwrap();
        set_active_site_id(&conn, b.id).unwrap();
        assert_eq!(get_active_site_id(&conn).unwrap(), Some(b.id));

        // 不存在的站点报错
        assert!(set_active_site_id(&conn, 999).is_err());
        // 设置失败不影响已存值
        assert_eq!(get_active_site_id(&conn).unwrap(), Some(b.id));
    }

    #[test]
    fn invalid_active_value_treated_as_none() {
        let conn = mem_db();
        set_setting(&conn, ACTIVE_SITE_KEY, "not-a-number").unwrap();
        assert_eq!(get_active_site_id(&conn).unwrap(), None);
    }
}
