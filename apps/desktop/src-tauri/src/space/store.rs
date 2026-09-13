//! `spaces` 表的读写。
//!
//! 这一层只跟数据库打交道——**没有任何文件系统操作**。旧版的注册表层要处理
//! 「路径规范化 / 去重 / 文件是否还在 / 目录还是文件」这一堆问题，随着
//! 「空间 = 一行记录」全部消失。

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use super::model::{Space, SpaceError, SpaceSnapshot};
use crate::db;

const META_ACTIVE_SPACE: &str = "active_space_id";

/// 时间戳统一走 `crate::time`；在这里再导出一次，方便 `commands` 直接 `store::now_millis()`。
pub use crate::time::now_millis;

/// 生成稳定 id：FNV-1a(种子 + 纳秒时间戳 + 进程内自增计数)。
/// 不引入 uuid crate，靠「时间 + 计数」保证同进程内不撞、跨进程几乎不可能撞。
static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn new_id(seed: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tail = format!("{nanos}-{seq}");

    let mut hash: u64 = 0xcbf2_9ce4_8422_2325; // FNV-1a 64bit offset basis
    for byte in seed.as_bytes().iter().chain(tail.as_bytes()) {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    format!("sp_{hash:016x}")
}

const SELECT_SPACES: &str =
    "SELECT id, name, icon, description, created_at, last_opened_at
     FROM spaces ORDER BY created_at ASC, id ASC";

/// 时间戳一律按 i64 读写：rusqlite 的 FromSql/ToSql 不覆盖 u64
///（SQLite 整数是有符号 64 位，u64 可能溢出），转一道最省心。
fn map_space(row: &rusqlite::Row<'_>) -> rusqlite::Result<Space> {
    Ok(Space {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        description: row.get(3)?,
        created_at: row.get::<_, i64>(4)? as u64,
        last_opened_at: row.get::<_, i64>(5)? as u64,
    })
}

pub fn load_spaces(conn: &Connection) -> Result<Vec<Space>, SpaceError> {
    let mut stmt = conn.prepare(SELECT_SPACES).map_err(SpaceError::from)?;
    let rows = stmt.query_map([], map_space).map_err(SpaceError::from)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(SpaceError::from)?);
    }
    Ok(out)
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<Space>, SpaceError> {
    Ok(load_spaces(conn)?.into_iter().find(|s| s.id == id))
}

/// 该 id 是否存在。文章命令每条都要问一次，所以用 `count(*)` 而不是 `load_spaces`。
pub fn exists(conn: &Connection, id: &str) -> Result<bool, SpaceError> {
    let n: i64 = conn
        .query_row("SELECT count(*) FROM spaces WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .map_err(SpaceError::from)?;
    Ok(n > 0)
}

/// 按名字找（大小写不敏感）。用于「空间名不能重复」的校验。
pub fn find_by_name(conn: &Connection, name: &str) -> Result<Option<Space>, SpaceError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, icon, description, created_at, last_opened_at
             FROM spaces WHERE name = ?1 COLLATE NOCASE",
        )
        .map_err(SpaceError::from)?;
    let mut rows = stmt.query([name]).map_err(SpaceError::from)?;
    match rows.next().map_err(SpaceError::from)? {
        Some(row) => Ok(Some(map_space(row).map_err(SpaceError::from)?)),
        None => Ok(None),
    }
}

/// 插入一个新空间。
pub fn insert_space(conn: &Connection, space: &Space) -> Result<(), SpaceError> {
    conn.execute(
        "INSERT INTO spaces (id, name, icon, description, created_at, last_opened_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            space.id,
            space.name,
            space.icon,
            space.description,
            space.created_at as i64,
            space.last_opened_at as i64,
        ],
    )
    .map_err(SpaceError::from)?;
    Ok(())
}

/// 刷新「最后打开时间」。
pub fn touch(conn: &Connection, id: &str, now: u64) -> Result<(), SpaceError> {
    conn.execute(
        "UPDATE spaces SET last_opened_at = ?2 WHERE id = ?1",
        rusqlite::params![id, now as i64],
    )
    .map_err(SpaceError::from)?;
    Ok(())
}

/// 删除空间。**这会连带删掉该空间的全部文章与标签**（`ON DELETE CASCADE`，
/// 依赖连接上的 `PRAGMA foreign_keys = ON`，见 `crate::db::tune`）。
///
/// 旧版这里是「只删注册表记录、不动磁盘文件」，所以删除是安全的；现在内容就在
/// 同一个库里，删除即销毁。调用方（命令层/前端）必须先让用户明确确认。
pub fn delete_space(conn: &Connection, id: &str) -> Result<bool, SpaceError> {
    let n = conn
        .execute("DELETE FROM spaces WHERE id = ?1", [id])
        .map_err(SpaceError::from)?;
    Ok(n > 0)
}

/// 该空间下还有多少篇文章——删除前给用户看「将删除 N 篇」用。
pub fn article_count(conn: &Connection, id: &str) -> Result<u64, SpaceError> {
    let n: i64 = conn
        .query_row(
            "SELECT count(*) FROM articles WHERE space_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(SpaceError::from)?;
    Ok(n.max(0) as u64)
}

pub fn active_space_id(conn: &Connection) -> Result<Option<String>, SpaceError> {
    match db::get_meta(conn, META_ACTIVE_SPACE) {
        Ok(v) => Ok(v),
        Err(e) => Err(SpaceError::from(e)),
    }
}

/// 设置当前激活空间；传 None 表示清空。
pub fn set_active(conn: &Connection, id: Option<&str>) -> Result<(), SpaceError> {
    match id {
        Some(id) => db::set_meta(conn, META_ACTIVE_SPACE, id).map_err(SpaceError::from),
        None => db::remove_meta(conn, META_ACTIVE_SPACE).map_err(SpaceError::from),
    }
}

pub fn snapshot_of(
    spaces: &[Space],
    active: Option<String>,
    db_path: String,
) -> SpaceSnapshot {
    SpaceSnapshot {
        spaces: spaces.to_vec(),
        active_space_id: active,
        db_path,
    }
}
