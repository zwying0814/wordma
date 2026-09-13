//! 前端 `src/types/space.ts` 的 Rust 镜像。
//!
//! 两边字段与错误码必须严格一一对应——JSON 序列化结果就是 IPC 契约本身，
//! 改这里必须同步改 TS，反之亦然。`rename_all = "camelCase"` 保证前端拿到驼峰字段。
//!
//! 存储形态已收敛为**整个应用一个库**（`<app_config_dir>/wordma.db`），
//! 空间只是其中 `spaces` 表的一行。于是 `Space` 上**没有 `path` 了**——
//! 空间不再对应磁盘上的任何路径，「文件被挪走 / 找不到空间」这类状态随之消失。

use serde::{Deserialize, Serialize};

use crate::db::DbError;

/// 空间记录 = `spaces` 表的一行。
///
/// 只含可序列化原语（绝不存 Date / PathBuf / 组件引用）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    /// 稳定 key：由 [`super::store::new_id`] 生成，永不随名称变化
    pub id: String,
    /// 显示名，空间内唯一（大小写不敏感）
    pub name: String,
    /// 稳定字符串 key（见 `src/lib/space-icons.ts`），不是图标组件
    pub icon: String,
    pub description: String,
    /// epoch ms（不用 Date，JSON 会退化成字符串）
    pub created_at: u64,
    pub last_opened_at: u64,
}

/// 空间列表快照。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceSnapshot {
    pub spaces: Vec<Space>,
    pub active_space_id: Option<String>,
    /// 应用库文件的绝对路径。前端用它做「在文件管理器中显示」与备份落点提示——
    /// 以前这个信息在 `Space.path` 上，现在整个应用只有这一个文件。
    pub db_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceData {
    #[serde(flatten)]
    pub snapshot: SpaceSnapshot,
    pub space: Space,
}

/// 错误码。字面量必须与 TS `SpaceErrorCode` 联合类型完全一致。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SpaceErrorCode {
    #[serde(rename = "INVALID_NAME")]
    InvalidName,
    #[serde(rename = "INVALID_PATH")]
    InvalidPath,
    #[serde(rename = "NOT_FOUND")]
    NotFound,
    #[serde(rename = "DUPLICATE_NAME")]
    DuplicateName,
    /// 目标位置已有同名文件（备份落点用）——不是路径非法，只是需要换个名字
    #[serde(rename = "ALREADY_EXISTS")]
    AlreadyExists,
    /// 库结构损坏或版本无法识别
    #[serde(rename = "INVALID_SPACE_FILE")]
    InvalidSpaceFile,
    #[serde(rename = "PERMISSION_DENIED")]
    PermissionDenied,
    #[serde(rename = "STORE_UNAVAILABLE")]
    StoreUnavailable,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

/// 错误信封。命令绝不 panic，一律返回 Err(SpaceError)；
/// 前端把它还原成 `{ ok: false, error }`（见 `src/lib/tauri/space-api.ts`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceError {
    pub code: SpaceErrorCode,
    pub message: String,
}

impl SpaceError {
    pub fn new(code: SpaceErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// 直接吃 `rusqlite::Error`：`store` / `commands` 里大量 `map_err(SpaceError::from)`
/// 作用在 `rusqlite::Result` 上，有这一个 impl 才不用每次手动包一层 `DbError`。
impl From<rusqlite::Error> for SpaceError {
    fn from(e: rusqlite::Error) -> Self {
        Self::from(DbError::Sqlite(e))
    }
}

/// 把数据库错误翻译成用户能看懂的空间错误。
///
/// 原则：**底层措辞不外泄**。SQLite 的技术细节对用户统一是
/// 「笔记库操作失败」，而不是原始错误串。
impl From<DbError> for SpaceError {
    fn from(e: DbError) -> Self {
        match &e {
            DbError::Corrupt(msg) => Self::new(SpaceErrorCode::InvalidSpaceFile, msg.clone()),
            DbError::Unavailable(msg) => Self::new(SpaceErrorCode::StoreUnavailable, msg.clone()),
            DbError::Sqlite(_) => {
                let text = e.to_string();
                if text.contains("permission denied") || text.contains("readonly") {
                    Self::new(SpaceErrorCode::PermissionDenied, "没有读写笔记数据的权限")
                } else {
                    Self::new(SpaceErrorCode::Unknown, format!("笔记库操作失败：{text}"))
                }
            }
        }
    }
}
