use std::fs;
use std::path::PathBuf;

use base64::Engine;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::db::Db;

pub const MEDIA_MAX_BYTES: usize = 200 * 1024 * 1024; // 单文件上限 200MB

/// 允许的图片/视频类型（mime 前缀 -> 扩展名校验用）
const IMAGE_MIMES: &[&str] = &["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const VIDEO_MIMES: &[&str] = &["video/mp4", "video/webm", "video/quicktime"];

pub fn media_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    fs::create_dir_all(&dir).map_err(|e| format!("创建媒体目录失败: {e}"))?;
    Ok(dir)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: i64,
    pub site_id: i64,
    pub filename: String,
    pub original_name: String,
    pub mime_type: String,
    /// image | video
    pub kind: String,
    pub size: i64,
    /// 磁盘绝对路径（前端经 asset 协议显示）
    pub path: String,
    pub created_at: String,
}

const MEDIA_COLS: &str = "id, site_id, filename, original_name, mime_type, kind, size, path, created_at";

fn row_to_media(row: &rusqlite::Row) -> rusqlite::Result<Media> {
    Ok(Media {
        id: row.get(0)?,
        site_id: row.get(1)?,
        filename: row.get(2)?,
        original_name: row.get(3)?,
        mime_type: row.get(4)?,
        kind: row.get(5)?,
        size: row.get(6)?,
        path: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn classify_mime(mime: &str) -> Result<&'static str, String> {
    if IMAGE_MIMES.contains(&mime) {
        Ok("image")
    } else if VIDEO_MIMES.contains(&mime) {
        Ok("video")
    } else {
        Err(format!("不支持的媒体类型: {mime}"))
    }
}

fn media_from_row_by_id(conn: &Connection, id: i64) -> Result<Media, String> {
    conn.query_row(
        &format!("SELECT {MEDIA_COLS} FROM media WHERE id = ?1"),
        params![id],
        row_to_media,
    )
    .map_err(|_| format!("媒体不存在: {id}"))
}

/// 解析原始文件名 → 安全扩展名（仅字母数字，最长 8 位）
fn safe_ext(name: &str, mime: &str) -> String {
    let ext = name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let ext = ext.as_str();
    let ext = if ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric()) && !ext.is_empty()
    {
        ext
    } else {
        match mime {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/svg+xml" => "svg",
            "video/mp4" => "mp4",
            "video/webm" => "webm",
            "video/quicktime" => "mov",
            _ => "bin",
        }
    };
    ext.to_string()
}

/// 上传媒体文件：解码 base64、写入站点媒体目录、登记入库
pub fn insert_media(
    conn: &Connection,
    media_dir: &PathBuf,
    site_id: i64,
    original_name: &str,
    mime_type: &str,
    data_base64: &str,
) -> Result<Media, String> {
    use base64::engine::general_purpose::STANDARD as BASE64;

    let kind = classify_mime(mime_type)?;
    let data = BASE64
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("解码媒体数据失败: {e}"))?;
    if data.is_empty() {
        return Err("媒体文件为空".into());
    }
    if data.len() > MEDIA_MAX_BYTES {
        return Err(format!("文件超过大小上限（{} MB）", MEDIA_MAX_BYTES / 1024 / 1024));
    }

    let site_dir = media_dir.join(site_id.to_string());
    fs::create_dir_all(&site_dir).map_err(|e| format!("创建站点媒体目录失败: {e}"))?;

    let ext = safe_ext(original_name, mime_type);
    let filename = format!(
        "{}-{}.{ext}",
        chrono_like_timestamp(),
        short_random(),
    );
    let full_path = site_dir.join(&filename);
    fs::write(&full_path, &data).map_err(|e| format!("写入媒体文件失败: {e}"))?;

    conn.execute(
        "INSERT INTO media (site_id, filename, original_name, mime_type, kind, size, path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            site_id,
            filename,
            original_name.trim(),
            mime_type,
            kind,
            data.len() as i64,
            full_path.to_string_lossy(),
        ],
    )
    .map_err(|e| {
        let _ = fs::remove_file(&full_path);
        format!("登记媒体失败: {e}")
    })?;
    media_from_row_by_id(conn, conn.last_insert_rowid())
}

pub fn get_media_list(conn: &Connection, site_id: i64) -> Result<Vec<Media>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {MEDIA_COLS} FROM media WHERE site_id = ?1 ORDER BY id DESC"
        ))
        .map_err(|e| format!("查询媒体失败: {e}"))?;
    let rows = stmt
        .query_map(params![site_id], row_to_media)
        .map_err(|e| format!("查询媒体失败: {e}"))?;
    rows.collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| format!("读取媒体失败: {e}"))
}

pub fn delete_media(conn: &Connection, id: i64) -> Result<(), String> {
    let media = media_from_row_by_id(conn, id)?;
    conn.execute("DELETE FROM media WHERE id = ?1", params![id])
        .map_err(|e| format!("删除媒体记录失败: {e}"))?;
    let _ = fs::remove_file(&media.path);
    Ok(())
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn short_random() -> String {
    // 轻量随机后缀：时间纳秒低位即可，避免引入额外依赖
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{nanos:08x}")
}

// ===== Tauri commands =====

#[tauri::command]
pub fn list_media(db: State<Db>, site_id: i64) -> Result<Vec<Media>, String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    get_media_list(&conn, site_id)
}

#[tauri::command]
pub fn upload_media(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    name: String,
    mime_type: String,
    data_base64: String,
) -> Result<Media, String> {
    let media_dir = media_root(&app)?;
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    insert_media(&conn, &media_dir, site_id, &name, &mime_type, &data_base64)
}

#[tauri::command]
pub fn delete_media_cmd(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("数据库连接不可用: {e}"))?;
    delete_media(&conn, id)
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
    fn upload_list_delete_roundtrip() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();
        let dir = std::env::temp_dir().join(format!("wordma-media-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        // PNG 魔数的最小内容
        let png = "iVBORw0KGgo=";
        let m = insert_media(&conn, &dir, site.id, " 截图.PNG ", "image/png", png).unwrap();
        assert_eq!(m.kind, "image");
        assert_eq!(m.original_name, "截图.PNG");
        assert!(m.filename.ends_with(".png"));
        assert!(m.path.contains(&site.id.to_string()));
        assert!(fs::File::open(&m.path).is_ok());

        let list = get_media_list(&conn, site.id).unwrap();
        assert_eq!(list.len(), 1);

        delete_media(&conn, m.id).unwrap();
        assert!(get_media_list(&conn, site.id).unwrap().is_empty());
        assert!(fs::File::open(&m.path).is_err()); // 文件已删除

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_unsupported_and_empty() {
        let conn = mem_db();
        let site = insert_site(&conn, "站", None).unwrap();
        let dir = std::env::temp_dir().join("wordma-media-reject");

        assert!(insert_media(&conn, &dir, site.id, "a.exe", "application/exe", "aGk=").is_err());
        assert!(insert_media(&conn, &dir, site.id, "a.png", "image/png", "").is_err());
        assert!(insert_media(&conn, &dir, site.id, "b.txt", "text/plain", "aGk=").is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
