//! 文章相关 Tauri 命令。
//!
//! 命令名统一 `article_*`，参数由 Tauri 自动转成驼峰传给前端。所有命令返回
//! `Result<T, ArticleError>`：业务失败走 Err（前端还原为 `{ ok:false, error }`），绝不 panic。
//!
//! ## `space_id` 取代了 `space_path`
//!
//! 整个应用只有一个库（`<app_config_dir>/wordma.db`），文章靠 `space_id` 归属。
//! 所以命令不再需要「先解析一个文件路径、判断它是不是空间库」，
//! 但换来一条新的纪律：**每个查询都必须带上 `space_id`**，否则会串空间。
//!
//! 列表是**服务端分页**：只取当前页，`total` 供前端算总页数；翻页由 SQL 的
//! `LIMIT/OFFSET` 完成，没有「重新扫描目录」这回事了。
//!
//! 前端契约见 `src/lib/tauri/article-api.ts`。

use std::path::Path;

use rusqlite::Connection;
use tauri::AppHandle;

use super::model::{ArticleData, ArticleError, ArticleErrorCode, ArticlePageData, ArticleRecord};
use super::store::{self, NewArticle};
use super::import;
use crate::space::{db as space_db, store as space_store};

const MAX_NAME_LENGTH: usize = 128;

/// 标签的卫生上限：单个标签长度与标签数量。
const MAX_TAG_LEN: usize = 32;
const MAX_TAGS: usize = 10;

/// slug 允许的字符集：ASCII 字母、数字、连字符、下划线。
/// 与前端 `src/lib/article-name.ts` 的 `ALLOWED_CHARS` 同源，改动务必同步。
fn is_allowed_slug_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_'
}

/// 校验自定义 slug。字符集收窄为 `[A-Za-z0-9_-]`。
///
/// 采用白名单而非"列举非法字符"：控制字符、路径分隔符、`.`/`..`、
/// 中文与全角字符等全部落集合外。slug 现在虽然只是库里的一列，
/// 但它仍会出现在**导出**的文件名里，所以这里继续把跨平台文件名的坑挡住。
fn validate_slug(raw: &str) -> Result<String, ArticleError> {
    let slug = raw.trim();

    if slug.is_empty() {
        return Err(ArticleError::new(ArticleErrorCode::InvalidName, "slug 不能为空"));
    }
    if slug.chars().count() > MAX_NAME_LENGTH {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            format!("slug 不能超过 {MAX_NAME_LENGTH} 个字符"),
        ));
    }
    if !slug.chars().all(is_allowed_slug_char) {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "slug 只能包含字母、数字、- 和 _",
        ));
    }

    Ok(slug.to_string())
}

/// 删除/置顶/导出等「按 slug 定位已有文章」时的轻校验：只拦空值与明显越界，**不限制字符集**。
///
/// 与 `validate_slug` 分开，是因为老笔记里可能存在更早版本创建的、含非 ASCII 的 slug
/// （当时字符集未收窄，导入时也一律照收）；若这些操作也走严格白名单，
/// 那些文章将永远删不掉、置不了顶。
fn validate_slug_of_existing(raw: &str) -> Result<String, ArticleError> {
    let slug = raw.trim();

    if slug.is_empty() {
        return Err(ArticleError::new(ArticleErrorCode::InvalidName, "slug 不能为空"));
    }
    if slug.chars().count() > MAX_NAME_LENGTH {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            format!("slug 不能超过 {MAX_NAME_LENGTH} 个字符"),
        ));
    }
    if slug.chars().any(|c| c.is_control()) {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "slug 含有非法字符",
        ));
    }

    Ok(slug.to_string())
}

/// 打开应用库并确认目标空间可用。所有文章命令的第一句。
///
/// 两件事，顺序不能换：
/// 1. 库能打开（不存在会被创建——这是应用自己的库，不是用户随手选的路径）；
/// 2. 空间确实存在，否则直接给「空间不存在」而不是让后续查询返回一堆空
///    （FK 也能拦住写入，但报错文案是给机器看的）。
fn open_ready(app: &AppHandle, space_id: &str) -> Result<Connection, ArticleError> {
    let space_id = space_id.trim();
    if space_id.is_empty() {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidPath,
            "未指定笔记空间，请先选择或新建一个空间",
        ));
    }

    let conn = space_db::open(app)?;

    if !space_store::exists(&conn, space_id)
        .map_err(|e| ArticleError::new(ArticleErrorCode::Unknown, e.message))?
    {
        return Err(ArticleError::new(
            ArticleErrorCode::NotFound,
            "空间不存在，可能已被移除",
        ));
    }

    Ok(conn)
}

/// 规范化标签：去空白、丢空值、截断超长、去重（大小写不敏感），并限制数量。
/// 同时清掉换行等控制字符。
fn normalize_tags(raw: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in raw {
        let cleaned: String = tag
            .chars()
            .filter(|c| !c.is_control())
            .collect::<String>()
            .trim()
            .chars()
            .take(MAX_TAG_LEN)
            .collect();
        if cleaned.is_empty() {
            continue;
        }
        if out.iter().any(|t| t.eq_ignore_ascii_case(&cleaned)) {
            continue;
        }
        out.push(cleaned);
        if out.len() >= MAX_TAGS {
            break;
        }
    }
    out
}

/// 只接受 `YYYY-MM-DD`（前端传本地日期），其余一律忽略。
fn normalize_date(raw: Option<String>) -> Option<String> {
    let s = raw?;
    let t = s.trim().replace('/', "-");
    if t.len() < 10 {
        return None;
    }
    let b = t.as_bytes();
    let shaped = b[0..4].iter().all(u8::is_ascii_digit)
        && b[4] == b'-'
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[7] == b'-'
        && b[8..10].iter().all(u8::is_ascii_digit);
    shaped.then(|| t[..10].to_string())
}

/// 新建文章的初始正文。标题由 `title` 列承担，正文里再放一级标题，
/// 是为了导出成 MDX 后文件本身可读（`# 标题` 是 Markdown 的惯例开头）。
fn default_body(title: &str) -> String {
    format!("# {title}\n\n开始写作…\n")
}

// ===== 命令 =====

/// 分页列出某个空间的文章。排序：置顶优先 → 日期倒序 → slug 升序。
///
/// 只返回当前页：`total` 供前端算总页数。请求页码越界会被夹到有效范围，
/// 并以返回的 `page` 为准（前端据此修正 UI，例如删完最后一页自动回退）。
#[tauri::command]
pub fn article_page(
    app: AppHandle,
    space_id: String,
    page: usize,
    page_size: usize,
) -> Result<ArticlePageData, ArticleError> {
    let conn = open_ready(&app, &space_id)?;
    Ok(store::page(&conn, space_id.trim(), page, page_size)?)
}

/// 全文检索。分页语义与 `article_page` 完全一致，前端可以直接复用列表 UI。
///
/// 检索规则见 `store` 模块头注释：≥3 字的词走 FTS5（bm25 相关度排序），
/// 更短的词退回 `LIKE` 兜底——因为 trigram 分词器索引不出短于 3 字的词。
#[tauri::command]
pub fn article_search(
    app: AppHandle,
    space_id: String,
    query: String,
    page: usize,
    page_size: usize,
) -> Result<ArticlePageData, ArticleError> {
    let conn = open_ready(&app, &space_id)?;
    Ok(store::search(&conn, space_id.trim(), &query, page, page_size)?)
}

/// 取单篇文章（含正文）。打开编辑器时用。
#[tauri::command]
pub fn article_get(
    app: AppHandle,
    space_id: String,
    slug: String,
) -> Result<ArticleRecord, ArticleError> {
    let slug = validate_slug_of_existing(&slug)?;
    let conn = open_ready(&app, &space_id)?;
    store::get(&conn, space_id.trim(), &slug)?.ok_or_else(|| {
        ArticleError::new(ArticleErrorCode::NotFound, format!("文章「{slug}」不存在"))
    })
}

/// 新建文章：往 `articles` 表插一行。
/// `slug` 在**该空间内**唯一——同空间已存在则返回 `ARTICLE_EXISTS` 并**禁止覆盖**。
#[tauri::command]
pub fn article_create(
    app: AppHandle,
    space_id: String,
    title: String,
    slug: String,
    tags: Vec<String>,
    date: Option<String>,
) -> Result<ArticleData, ArticleError> {
    let slug = validate_slug(&slug)?;
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "文章标题不能为空",
        ));
    }

    let space_id = space_id.trim();
    let conn = open_ready(&app, space_id)?;
    if store::exists(&conn, space_id, &slug)? {
        return Err(ArticleError::new(
            ArticleErrorCode::ArticleExists,
            format!("本空间已存在 slug 为「{slug}」的文章，slug 必须唯一，无法覆盖已有文章"),
        ));
    }

    let tags = normalize_tags(tags);
    let date = normalize_date(date);
    let body = default_body(&title);

    let article = store::insert(
        &conn,
        space_id,
        NewArticle {
            slug: &slug,
            title: &title,
            body: &body,
            date: date.as_deref(),
            tags: &tags,
            draft: false,
            pinned: false,
        },
    )?;

    Ok(ArticleData { article })
}

// 说明：slug 生成（标题 → slug）在前端 wasm 包 `packages/slug`（`@wordma/slug`），
// 不经由后端命令（见 `apps/desktop/src/lib/slug.ts`）。
// 后端只保留创建/置顶/删除所需的 `validate_slug` 与唯一性校验。

/// 保存正文（编辑器的「保存」）。文章不存在返回 `NOT_FOUND`。
///
/// 刻意**只更新 `body`**：标题/标签/日期是列表侧的元信息，编辑器暂不承担。
/// 全文索引与 `size`/`updated_at` 的刷新都在 store 层一条 UPDATE 里完成。
#[tauri::command]
pub fn article_update(
    app: AppHandle,
    space_id: String,
    slug: String,
    body: String,
) -> Result<ArticleData, ArticleError> {
    let slug = validate_slug_of_existing(&slug)?;
    let conn = open_ready(&app, &space_id)?;

    let article = store::update_body(&conn, space_id.trim(), &slug, &body)?.ok_or_else(|| {
        ArticleError::new(ArticleErrorCode::NotFound, format!("文章「{slug}」不存在"))
    })?;

    Ok(ArticleData { article })
}

/// 置顶/取消置顶。置顶文章在分页结果中排在最前。
#[tauri::command]
pub fn article_set_pinned(
    app: AppHandle,
    space_id: String,
    slug: String,
    pinned: bool,
) -> Result<ArticleData, ArticleError> {
    let slug = validate_slug_of_existing(&slug)?;
    let conn = open_ready(&app, &space_id)?;

    let article = store::set_pinned(&conn, space_id.trim(), &slug, pinned)?.ok_or_else(|| {
        ArticleError::new(ArticleErrorCode::NotFound, format!("文章「{slug}」不存在"))
    })?;

    Ok(ArticleData { article })
}

/// 删除文章。不存在返回 `NOT_FOUND`。
///
/// 返回单元值：分页场景下删除会改变 total/页码，前端应重新拉取当前页，
/// 因此这里没有可复用的返回值可给。
#[tauri::command]
pub fn article_delete(
    app: AppHandle,
    space_id: String,
    slug: String,
) -> Result<(), ArticleError> {
    let slug = validate_slug_of_existing(&slug)?;
    let conn = open_ready(&app, &space_id)?;

    if !store::delete(&conn, space_id.trim(), &slug)? {
        return Err(ArticleError::new(
            ArticleErrorCode::NotFound,
            format!("文章「{slug}」不存在"),
        ));
    }

    Ok(())
}

/// 把一篇文章导出成 `.mdx` 文件，返回写出的绝对路径。
///
/// 这是「数据库化」之后唯一把内容落回文件系统的出口。
#[tauri::command]
pub fn article_export(
    app: AppHandle,
    space_id: String,
    slug: String,
    dest_dir: String,
) -> Result<String, ArticleError> {
    let slug = validate_slug_of_existing(&slug)?;
    if dest_dir.trim().is_empty() {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidPath,
            "未指定导出目录",
        ));
    }

    let conn = open_ready(&app, &space_id)?;
    let path = import::export_article(&conn, space_id.trim(), &slug, Path::new(dest_dir.trim()))?;
    Ok(path.to_string_lossy().to_string())
}
