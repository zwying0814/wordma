use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

pub const NAME_MAX: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub site_id: i64,
    pub name: String,
    pub created_at: String,
    pub article_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub site_id: i64,
    pub name: String,
    pub created_at: String,
    pub article_count: i64,
}

/// 校验并规范化名称；Err 为面向用户的提示
fn normalize_name(name: &str, label: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(format!("{label}名称不能为空"));
    }
    if name.chars().count() > NAME_MAX {
        return Err(format!("{label}名称不能超过 {NAME_MAX} 个字符"));
    }
    Ok(name.to_string())
}

fn is_unique_conflict(e: &rusqlite::Error) -> bool {
    crate::db::is_unique_conflict(e)
}

// 标签计数经 article_tags 关联表；分类计数经 article_categories 关联表
const TAG_SELECT: &str = "t.id, t.site_id, t.name, t.created_at, COUNT(at.article_id) \
     FROM tags t LEFT JOIN article_tags at ON at.tag_id = t.id";
const CATEGORY_SELECT: &str = "t.id, t.site_id, t.name, t.created_at, COUNT(ac.article_id) \
     FROM categories t LEFT JOIN article_categories ac ON ac.category_id = t.id";

// ===== 标签 =====

fn tag_from_row(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        site_id: row.get(1)?,
        name: row.get(2)?,
        created_at: row.get(3)?,
        article_count: row.get(4)?,
    })
}

pub fn get_tag(conn: &Connection, id: i64) -> Result<Tag, String> {
    conn.query_row(
        &format!(
            "SELECT {} WHERE t.id = ?1 GROUP BY t.id",
            TAG_SELECT
        ),
        params![id],
        tag_from_row,
    )
    .map_err(|_| format!("标签不存在: {id}"))
}

pub fn get_tags_by_site(conn: &Connection, site_id: i64) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} WHERE t.site_id = ?1 GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
            TAG_SELECT
        ))
        .map_err(|e| format!("查询标签失败: {e}"))?;
    let rows = stmt
        .query_map(params![site_id], tag_from_row)
        .map_err(|e| format!("查询标签失败: {e}"))?;
    rows.collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| format!("读取标签失败: {e}"))
}

/// 新建；同站点同名时复用已有条目（与设计稿行为一致）
pub fn insert_tag(conn: &Connection, site_id: i64, name: &str) -> Result<Tag, String> {
    let name = normalize_name(name, "标签")?;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM tags WHERE site_id = ?1 AND name = ?2",
            params![site_id, name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("查询标签失败: {e}"))?;
    if let Some(id) = exists {
        return get_tag(conn, id);
    }
    conn.execute(
        "INSERT INTO tags (site_id, name) VALUES (?1, ?2)",
        params![site_id, name],
    )
    .map_err(|e| format!("创建标签失败: {e}"))?;
    get_tag(conn, conn.last_insert_rowid())
}

pub fn rename_tag(conn: &Connection, id: i64, name: &str) -> Result<Tag, String> {
    let name = normalize_name(name, "标签")?;
    conn.execute("UPDATE tags SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| {
            if is_unique_conflict(&e) {
                "已有同名标签".to_string()
            } else {
                format!("重命名失败: {e}")
            }
        })?;
    get_tag(conn, id)
}

pub fn delete_tag(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| format!("删除标签失败: {e}"))?;
    Ok(())
}

// ===== 分类 =====

fn category_from_row(row: &rusqlite::Row) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        site_id: row.get(1)?,
        name: row.get(2)?,
        created_at: row.get(3)?,
        article_count: row.get(4)?,
    })
}

pub fn get_category(conn: &Connection, id: i64) -> Result<Category, String> {
    conn.query_row(
        &format!(
            "SELECT {} WHERE t.id = ?1 GROUP BY t.id",
            CATEGORY_SELECT
        ),
        params![id],
        category_from_row,
    )
    .map_err(|_| format!("分类不存在: {id}"))
}

pub fn get_categories_by_site(conn: &Connection, site_id: i64) -> Result<Vec<Category>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} WHERE t.site_id = ?1 GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
            CATEGORY_SELECT
        ))
        .map_err(|e| format!("查询分类失败: {e}"))?;
    let rows = stmt
        .query_map(params![site_id], category_from_row)
        .map_err(|e| format!("查询分类失败: {e}"))?;
    rows.collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| format!("读取分类失败: {e}"))
}

pub fn insert_category(conn: &Connection, site_id: i64, name: &str) -> Result<Category, String> {
    let name = normalize_name(name, "分类")?;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM categories WHERE site_id = ?1 AND name = ?2",
            params![site_id, name],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("查询分类失败: {e}"))?;
    if let Some(id) = exists {
        return get_category(conn, id);
    }
    conn.execute(
        "INSERT INTO categories (site_id, name) VALUES (?1, ?2)",
        params![site_id, name],
    )
    .map_err(|e| format!("创建分类失败: {e}"))?;
    get_category(conn, conn.last_insert_rowid())
}

pub fn rename_category(conn: &Connection, id: i64, name: &str) -> Result<Category, String> {
    let name = normalize_name(name, "分类")?;
    conn.execute(
        "UPDATE categories SET name = ?1 WHERE id = ?2",
        params![name, id],
    )
    .map_err(|e| {
        if is_unique_conflict(&e) {
            "已有同名分类".to_string()
        } else {
            format!("重命名失败: {e}")
        }
    })?;
    get_category(conn, id)
}

pub fn delete_category(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])
        .map_err(|e| format!("删除分类失败: {e}"))?;
    Ok(())
}

// ===== Tauri commands =====

#[tauri::command]
pub fn list_tags(db: State<Db>, site_id: i64) -> Result<Vec<Tag>, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_tags_by_site(&conn, site_id)
}

#[tauri::command]
pub fn create_tag(db: State<Db>, site_id: i64, name: String) -> Result<Tag, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    insert_tag(&conn, site_id, &name)
}

#[tauri::command]
pub fn rename_tag_cmd(db: State<Db>, id: i64, name: String) -> Result<Tag, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    rename_tag(&conn, id, &name)
}

#[tauri::command]
pub fn delete_tag_cmd(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    delete_tag(&conn, id)
}

#[tauri::command]
pub fn list_categories(db: State<Db>, site_id: i64) -> Result<Vec<Category>, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_categories_by_site(&conn, site_id)
}

#[tauri::command]
pub fn create_category(db: State<Db>, site_id: i64, name: String) -> Result<Category, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    insert_category(&conn, site_id, &name)
}

#[tauri::command]
pub fn rename_category_cmd(db: State<Db>, id: i64, name: String) -> Result<Category, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    rename_category(&conn, id, &name)
}

#[tauri::command]
pub fn delete_category_cmd(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    delete_category(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::article::insert_article;
        use crate::site::insert_site;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn tag_create_list_rename_delete() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();

        let a = insert_tag(&conn, site.id, "  旅行  ").unwrap();
        assert_eq!(a.name, "旅行");
        insert_tag(&conn, site.id, "美食").unwrap();

        let list = get_tags_by_site(&conn, site.id).unwrap();
        assert_eq!(list.len(), 2);
        // 名称排序（SQLite 按码点序，非拼音序）
        assert_eq!(list[0].name, "旅行"); // 按名称排序

        let renamed = rename_tag(&conn, a.id, "游记").unwrap();
        assert_eq!(renamed.name, "游记");

        delete_tag(&conn, a.id).unwrap();
        assert_eq!(get_tags_by_site(&conn, site.id).unwrap().len(), 1);
    }

    #[test]
    fn tag_duplicate_reuse_on_create_conflict_on_rename() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();
        let first = insert_tag(&conn, site.id, "旅行").unwrap();

        // 创建同名 → 复用已有条目
        let again = insert_tag(&conn, site.id, "旅行").unwrap();
        assert_eq!(again.id, first.id);
        assert_eq!(get_tags_by_site(&conn, site.id).unwrap().len(), 1);

        let other = insert_tag(&conn, site.id, "美食").unwrap();
        assert!(rename_tag(&conn, other.id, "旅行").is_err());

        assert!(insert_tag(&conn, site.id, "   ").is_err());
        assert!(insert_tag(&conn, site.id, &"x".repeat(NAME_MAX + 1)).is_err());
    }

    #[test]
    fn category_count_site_isolation_and_unlink_on_delete() {
        let conn = mem_db();
        let s1 = insert_site(&conn, "一", None).unwrap();
        let s2 = insert_site(&conn, "二", None).unwrap();
        let cat = insert_category(&conn, s1.id, "户外").unwrap();
        let a = insert_article(&conn, s1.id, "A").unwrap();
        insert_article(&conn, s2.id, "C").unwrap();

        crate::article::update_article(&conn, a.id, None, None, None, None, &[cat.id], &[])
            .unwrap();

        let list = get_categories_by_site(&conn, s1.id).unwrap();
        assert_eq!(list[0].article_count, 1);
        assert!(get_categories_by_site(&conn, s2.id).unwrap().is_empty());

        // 删除分类后文章解除关联（级联清理关联表）
        delete_category(&conn, cat.id).unwrap();
        let reloaded = crate::article::get_article(&conn, a.id).unwrap();
        assert!(reloaded.categories.is_empty());
    }
}
