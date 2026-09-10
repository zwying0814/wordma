//! 前端 `src/types/article.ts` 的 Rust 镜像。
//!
//! 两边字段与错误码必须严格一一对应——JSON 序列化结果就是 IPC 契约本身，
//! 改这里必须同步改 TS，反之亦然。`rename_all = "camelCase"` 保证前端拿到驼峰字段。

use serde::{Deserialize, Serialize};

/// 文章元信息（不含正文）。`slug` 为文件名（去扩展名），也是唯一键；
/// `title` 为展示标题，取自 frontmatter，缺省时回退到 `slug`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleMeta {
    /// 文章 slug（文件名，不含 `.mdx`），唯一键
    pub slug: String,
    /// 展示标题（取自 frontmatter `title`，缺省回退到 slug）
    pub title: String,
    /// 绝对路径（含 `.mdx`）
    pub path: String,
    /// epoch ms（文件修改时间，不用 Date）
    pub created_at: u64,
    /// 字节数
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateArticleData {
    pub article: ArticleMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleListData {
    pub articles: Vec<ArticleMeta>,
}

/// 由标题生成 slug 的返回（与 TS `ArticleSlugifyData` 镜像）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleSlugifyData {
    pub slug: String,
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
    #[serde(rename = "NOT_A_DIRECTORY")]
    NotADirectory,
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
        Self {
            code,
            message: message.into(),
        }
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
