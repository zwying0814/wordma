//! SQLite 连接、PRAGMA 与迁移运行器。
//!
//! 全项目只有这一个模块直接依赖 `rusqlite`，`space` 与 `article` 都通过它拿连接。
//! 之所以不用 `tauri-plugin-sql`：命令层在 Rust 侧，类型要跟着 `model.rs` 的前后端
//! 镜像走，SQL 散成前端字符串会把这层类型安全丢掉，FTS5 也不好在那边接。
//!
//! ## 库的落点
//!
//! **整个应用只有一个库**：`<app_config_dir>/wordma.db`。
//! 空间不再是独立文件，只是这个库里 `spaces` 表的一行；文章靠 `space_id`
//! 归属到某个空间。建表语句见 [`crate::space::db`]。
//!
//! 所以「切换空间」是一次 `UPDATE`/`SELECT`，不再有开文件、比路径、判存在这些东西。
//!
//! 迁移仍用同一套机制（`PRAGMA user_version` + 脚本数组），新增版本只需往数组尾部
//! 追加一条 DDL，不要修改已发布的历史脚本（老库里那些已经跑过了）。

use std::fmt;
use std::path::Path;

use rusqlite::Connection;

/// 统一的数据库错误。各业务模块再把它映射成自己的错误码
/// （见 `space::model::SpaceError::from` / `article::model::ArticleError::from`）。
#[derive(Debug)]
pub enum DbError {
    /// 底层 SQLite 失败（打开、执行、类型不匹配等）
    Sqlite(rusqlite::Error),
    /// 库能打开但结构损坏，或 user_version 比本程序认识的还新
    Corrupt(String),
    /// 连库的位置都拿不到（系统配置目录不可用、创建目录失败等）。
    /// 与 [`DbError::Corrupt`] 分开是为了让前端能区分「环境坏了」与「数据坏了」。
    Unavailable(String),
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite(e) => write!(f, "{e}"),
            Self::Corrupt(m) => write!(f, "{m}"),
            Self::Unavailable(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e)
    }
}

impl DbError {
    /// 是否为唯一约束冲突——用于把 slug 重名兜底翻译成业务错误。
    ///
    /// 刻意匹配消息文本而不是 `ffi::ErrorCode` 枚举：`ErrorCode` 在 rusqlite 各版本里
    /// 的重导出路径不完全一致，靠字符串判断既稳又够用（这里只是兜底，
    /// 正常路径下重名会先被一次 `SELECT` 拦下来并给出更清楚的提示）。
    pub fn is_unique_violation(&self) -> bool {
        match self {
            Self::Sqlite(rusqlite::Error::SqliteFailure(_, Some(msg))) => {
                msg.contains("UNIQUE constraint failed")
            }
            _ => false,
        }
    }
}

/// 打开一个库并套用统一的 PRAGMA。文件不存在会被 SQLite 创建。
pub fn open(path: &Path) -> Result<Connection, DbError> {
    let conn = Connection::open(path)?;
    tune(&conn)?;
    Ok(conn)
}

/// 统一的连接参数。
///
/// - `journal_mode = WAL`：读写不互相阻塞，崩溃恢复更快。注意它**有返回值**，
///   必须走 `query_row` 而不是 `pragma_update`（后者会因「语句返回了结果」报错）。
/// - `foreign_keys = ON`：`tags` 靠它做级联删除，**SQLite 默认是关的**，每个连接都得开。
/// - `busy_timeout`：备份 / 外部工具短暂持锁时不至于立刻失败。
fn tune(conn: &Connection) -> Result<(), DbError> {
    let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(())
}

/// 按 `PRAGMA user_version` 依次执行迁移脚本。
///
/// 每个版本单独包一层事务：中途失败会整版回滚，不会留下半张表。
/// 已经执行过的版本会被跳过，因此可重复调用。
pub fn migrate(conn: &Connection, migrations: &[&str]) -> Result<(), DbError> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let mut version = current.max(0) as usize;

    if version > migrations.len() {
        return Err(DbError::Corrupt(format!(
            "数据库版本 {version} 高于本程序支持的 {}，请升级 wordma",
            migrations.len()
        )));
    }

    while version < migrations.len() {
        conn.execute_batch("BEGIN")?;
        let step = (|| -> Result<(), DbError> {
            conn.execute_batch(migrations[version])?;
            version += 1;
            conn.pragma_update(None, "user_version", version as i64)?;
            Ok(())
        })();
        match step {
            Ok(()) => conn.execute_batch("COMMIT")?,
            Err(e) => {
                // 回滚本身失败也不该盖掉真正的错误，忽略它
                let _ = conn.execute_batch("ROLLBACK");
                return Err(e);
            }
        }
    }

    Ok(())
}

// ===== meta 表（键值）=====
// 空间库用它认领身份（`app_id = wordma`）并存展示信息；注册表用它存 active_space_id。

/// 读一个键，不存在返回 `Ok(None)`。表不存在则由调用方按 `is_missing_table` 判定。
pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, DbError> {
    let mut stmt = conn.prepare("SELECT value FROM meta WHERE key = ?1")?;
    let mut rows = stmt.query([key])?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

/// 写一个键（存在则覆盖）。
pub fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), DbError> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

/// 删一个键。删不存在的键不算错误。
pub fn remove_meta(conn: &Connection, key: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM meta WHERE key = ?1", [key])?;
    Ok(())
}

/// 生成一份备份（`VACUUM INTO`：输出的是完整且已整理过的库副本）。
///
/// 两个必须记住的约束：**不能在事务里执行**，且**拒绝覆盖已存在的文件**。
/// `rusqlite` 默认 autocommit，所以只要不主动开事务就没问题。
pub fn backup_to(conn: &Connection, dest: &Path) -> Result<(), DbError> {
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()])?;
    Ok(())
}
