//! 前端 `src/types/article.ts` 的 Rust 镜像。
//!
//! 两边字段与错误码必须严格一一对应——JSON 序列化结果就是 IPC 契约本身，
//! 改这里必须同步改 TS，反之亦然。`rename_all = "camelCase"` 保证前端拿到驼峰字段。
//!
//! 存储形态已从「`<空间>/content/<slug>.mdx` 文件」改为空间库里的 `articles` 行，
//! 所以 `ArticleMeta` **没有 `path` 字段了**——一篇文章不再对应某个文件。
//! 需要落成文件时走 [`super::import::export_article`] 单独导出。

use serde::{Deserialize, Serialize};

use crate::db::DbError;

/// 文章元信息（不含正文）。`slug` 是唯一键。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleMeta {
    /// 文章 slug，唯一键
    pub slug: String,
    /// 展示标题；导入时若原文件没有 title 则回退为 slug
    pub title: String,
    /// 文章日期（`YYYY-MM-DD`）；缺省为 None，前端回退 `createdAt`
    pub date: Option<String>,
    /// epoch ms（记录创建时间）
    pub created_at: u64,
    /// epoch ms（最后修改时间）
    pub updated_at: u64,
    /// 正文字节数
    pub size: u64,
    /// 标签；缺省为空数组
    pub tags: Vec<String>,
    /// 草稿标记（列表上显示为「草稿」）
    pub draft: bool,
    /// 置顶标记（列表置顶并渲染角标）
    pub pinned: bool,
}

/// 单篇文章的完整内容（含正文）。打开编辑器时用。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleRecord {
    pub article: ArticleMeta,
    pub body: String,
}

/// 单个文章的返回（创建 / 置顶等会改变单篇状态的命令）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleData {
    pub article: ArticleMeta,
}

/// 分页列表返回。`total` 是总条数（前端据此算总页数），`page` 为**实际生效**的页码
/// （请求越界时会被夹到有效范围内，前端以此为准修正 UI）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticlePageData {
    pub articles: Vec<ArticleMeta>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
}

/// 错误码。字面量必须与 TS `ArticleErrorCode` 联合类型完全一致。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ArticleErrorCode {
    #[serde(rename = "INVALID_NAME")]
    InvalidName,
    /// 同名文章已存在——创建时禁止覆盖
    #[serde(rename = "ARTICLE_EXISTS")]
    ArticleExists,
    #[serde(rename = "INVALID_PATH")]
    InvalidPath,
    #[serde(rename = "NOT_FOUND")]
    NotFound,
    #[serde(rename = "PERMISSION_DENIED")]
    PermissionDenied,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

/// 错误信封。命令绝不 panic，一律返回 Err(ArticleError)；
/// 前端把它还原成 `{ ok: false, error }`（见 `src/lib/tauri/article-api.ts`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArticleError {
    pub code: ArticleErrorCode,
    pub message: String,
}

impl ArticleError {
    pub fn new(code: ArticleErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

/// 把 `std::io::Error` 归一化为 ArticleError，避免把原始 OS 错误串直接抛给前端。
pub fn from_io_error(e: &std::io::Error, context: &str) -> ArticleError {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => ArticleErrorCode::NotFound,
        std::io::ErrorKind::PermissionDenied => ArticleErrorCode::PermissionDenied,
        std::io::ErrorKind::AlreadyExists => ArticleErrorCode::ArticleExists,
        _ => ArticleErrorCode::Unknown,
    };
    ArticleError::new(code, format!("{context}：{e}"))
}

/// 把数据库错误翻译成文章错误。底层 SQLite 措辞不外泄。
impl From<DbError> for ArticleError {
    fn from(e: DbError) -> Self {
        match &e {
            DbError::Corrupt(msg) => Self::new(ArticleErrorCode::Unknown, msg.clone()),
            // 库的位置都拿不到（配置目录不可用）——对用户来说就是「笔记暂时读不出来」，
            // 不是数据坏了，所以不给出误导性的修复建议
            DbError::Unavailable(msg) => Self::new(ArticleErrorCode::Unknown, msg.clone()),
            DbError::Sqlite(_) if e.is_unique_violation() => {
                Self::new(ArticleErrorCode::ArticleExists, "已存在同名的文章")
            }
            DbError::Sqlite(_) => {
                let text = e.to_string();
                if text.contains("permission denied") || text.contains("readonly") {
                    Self::new(ArticleErrorCode::PermissionDenied, "没有读写笔记库的权限")
                } else {
                    Self::new(ArticleErrorCode::Unknown, format!("笔记库操作失败：{text}"))
                }
            }
        }
    }
}

/// 直接吃 `rusqlite::Error`：`store` 里大量 `map_err(ArticleError::from)` 作用在
/// `rusqlite::Result` 上，有这一个 impl 才不用每次手动包一层 `DbError`。
impl From<rusqlite::Error> for ArticleError {
    fn from(e: rusqlite::Error) -> Self {
        Self::from(DbError::Sqlite(e))
    }
}
