//! 前端 `src/types/space.ts` 的 Rust 镜像。
//!
//! 两边字段与错误码必须严格一一对应——JSON 序列化结果就是 IPC 契约本身，
//! 改这里必须同步改 TS，反之亦然。`rename_all = "camelCase"` 保证前端拿到驼峰字段。

use serde::{Deserialize, Serialize};

/// 落盘记录：只含可序列化原语（绝不存 Date / PathBuf / 组件引用）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    /// 稳定 key：由 [`super::store::new_id`] 生成，永不随路径或名称变化
    pub id: String,
    /// 显示名，默认取自文件夹名
    pub name: String,
    /// 绝对路径，业务唯一键（去重靠它）
    pub path: String,
    /// 稳定字符串 key（见 `src/lib/space-icons.ts`），不是图标组件
    pub icon: String,
    pub description: String,
    /// epoch ms（不用 Date，JSON 会退化成字符串）
    pub created_at: u64,
    pub last_opened_at: u64,
}

/// IPC 返回的视图对象 = 落盘记录 + 运行时派生态。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceView {
    #[serde(flatten)]
    pub space: Space,
    /// 目录仍是有效空间（目录存在且标记文件完好），不落盘
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceSnapshot {
    pub spaces: Vec<SpaceView>,
    pub active_space_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceData {
    #[serde(flatten)]
    pub snapshot: SpaceSnapshot,
    pub space: SpaceView,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSpaceData {
    #[serde(flatten)]
    pub snapshot: SpaceSnapshot,
    pub space: SpaceView,
    /// true = 首次接入该目录；false = 目录已在列表中，本次只是切过去
    pub adopted: bool,
}

/// 扫描默认数据目录得到的候选空间（`space_scan` 命令返回项）。
/// 与 `Space` 不同：路径来自磁盘遍历而非注册表，`registered` 标记
/// 该目录是否已被注册表收录，前端据此决定「打开」还是「已在列表中」。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedSpace {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub path: String,
    pub created_at: u64,
    pub registered: bool,
}

/// 错误码。字面量必须与 TS `SpaceErrorCode` 联合类型完全一致。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SpaceErrorCode {
    #[serde(rename = "CANCELLED")]
    Cancelled,
    #[serde(rename = "INVALID_NAME")]
    InvalidName,
    #[serde(rename = "INVALID_PATH")]
    InvalidPath,
    #[serde(rename = "NOT_FOUND")]
    NotFound,
    #[serde(rename = "NOT_A_DIRECTORY")]
    NotADirectory,
    #[serde(rename = "DIR_EXISTS")]
    DirExists,
    #[serde(rename = "DIR_NOT_EMPTY")]
    DirNotEmpty,
    #[serde(rename = "ALREADY_REGISTERED")]
    AlreadyRegistered,
    #[serde(rename = "NOT_WORDMA_SPACE")]
    NotWordmaSpace,
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

/// 把 `std::io::Error` 归一化为 SpaceError，避免把原始 OS 错误串直接抛给前端。
pub fn from_io_error(e: &std::io::Error, context: &str) -> SpaceError {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => SpaceErrorCode::NotFound,
        std::io::ErrorKind::PermissionDenied => SpaceErrorCode::PermissionDenied,
        std::io::ErrorKind::AlreadyExists => SpaceErrorCode::DirExists,
        _ => SpaceErrorCode::Unknown,
    };
    SpaceError::new(code, format!("{context}：{e}"))
}
