//! 文章相关 Tauri 命令。
//!
//! 命令名统一 `article_*`，参数由 Tauri 自动转成驼峰传给前端
//! （`space_path` → `spacePath`）。所有命令返回 `Result<T, ArticleError>`：
//! 业务失败走 Err（前端还原为 `{ ok:false, error }`），绝不 panic。
//!
//! 前端契约见 `src/lib/tauri/article-api.ts`。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use tauri::AppHandle;

use rslug::Slugifier;

// 注意：crates.io 上的包名叫 `pinyin-converter`，但其 library target 名为 `pinyin`
// （见该包 Cargo.toml 的 `[lib] name = "pinyin"`），故 Rust 侧按 `pinyin::` 导入。
use pinyin::Pinyin;

use super::model::{
    from_io_error, ArticleError, ArticleErrorCode, ArticleListData, ArticleMeta, ArticleSlugifyData,
    CreateArticleData,
};

/// 文章落盘子目录（相对空间根目录）：`<空间>/content/<名称>.mdx`。
const CONTENT_DIR: &str = "content";
const MDX_EXT: &str = "mdx";

const MAX_NAME_LENGTH: usize = 128;
const ILLEGAL_CHARS: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

// ===== slug 校验（前端 `src/lib/article-name.ts` 的同源副本） =====
// 前端只用于即时反馈，这里必须独立再校验一次——永不信任前端。
// slug 即文件名（去扩展名），所以沿用与文件名相同的非法字符/保留名校验。

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
    if slug.chars().any(|c| ILLEGAL_CHARS.contains(&c)) {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "slug 不能包含 \\ / : * ? \" < > | 等字符",
        ));
    }
    if slug.chars().any(|c| c.is_control()) {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "slug 不能包含控制字符",
        ));
    }
    if slug == "." || slug == ".." {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "slug 不能为 . 或 ..",
        ));
    }
    if WINDOWS_RESERVED.contains(&slug.to_uppercase().as_str()) {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "该 slug 是系统保留名，不可用作文件名",
        ));
    }
    // Windows 会静默截断以 "." / 空格结尾的名称，导致记录的路径与磁盘实际不一致
    if slug.ends_with('.') || slug.ends_with(' ') {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "slug 不能以点或空格结尾",
        ));
    }

    Ok(slug.to_string())
}

/// 解析并校验空间目录，返回其下的 `content` 目录路径（不存在则创建）。
fn content_dir_for(space_path: &str) -> Result<PathBuf, ArticleError> {
    if space_path.trim().is_empty() {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidPath,
            "未指定空间目录",
        ));
    }
    let dir = Path::new(space_path);
    if !dir.exists() {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidPath,
            "空间目录不存在，请确认空间已打开",
        ));
    }
    if !dir.is_dir() {
        return Err(ArticleError::new(
            ArticleErrorCode::NotADirectory,
            "空间路径不是文件夹",
        ));
    }
    let content_dir = dir.join(CONTENT_DIR);
    if !content_dir.exists() {
        fs::create_dir_all(&content_dir)
            .map_err(|e| from_io_error(&e, "创建 content 目录失败"))?;
    }
    Ok(content_dir)
}

/// 由名称拼出 `.mdx` 路径。`name` 已通过校验、不含路径分隔符，join 不会产生越界。
fn mdx_path(content_dir: &Path, name: &str) -> PathBuf {
    content_dir.join(format!("{name}.{MDX_EXT}"))
}

/// slug 唯一性校验：先直接判存在，再大小写不敏感扫一遍
/// （Windows 上 `Note.mdx` 与 `note.mdx` 视为同一文件，必须都拦下）。
fn article_slug_exists(content_dir: &Path, slug: &str) -> bool {
    if mdx_path(content_dir, slug).exists() {
        return true;
    }
    let target = slug.to_lowercase();
    if let Ok(entries) = fs::read_dir(content_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some(MDX_EXT) {
                continue;
            }
            if p
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())
                == Some(target.clone())
            {
                return true;
            }
        }
    }
    false
}

/// 从 MDX 的 frontmatter 中解析 `title`，缺省返回 None（列表回退到 slug）。
fn parse_title(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let rest = content.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let fm = &rest[..end];
    for line in fm.lines() {
        let line = line.trim_start();
        if let Some(v) = line.strip_prefix("title:") {
            let mut v = v.trim().to_string();
            // 去掉包围的引号（双引号或单引号）
            if (v.starts_with('"') && v.ends_with('"') && v.len() >= 2)
                || (v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2)
            {
                v = v[1..v.len() - 1].to_string();
            }
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}

/// 读取文件元信息组装 `ArticleMeta`。`title` 取自 frontmatter，缺省回退到 slug。
fn meta_of(path: &Path, slug: &str) -> Result<ArticleMeta, ArticleError> {
    let meta = fs::metadata(path).map_err(|e| from_io_error(&e, "读取文章信息失败"))?;
    let created_at = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let title = parse_title(path).unwrap_or_else(|| slug.to_string());
    Ok(ArticleMeta {
        slug: slug.to_string(),
        title,
        path: path.to_string_lossy().to_string(),
        created_at,
        size: meta.len(),
    })
}

/// 默认 MDX 正文：带 frontmatter（title），正文放一个以 title 为标题的一级标题。
/// 文件名由 slug 决定，与 title 解耦。
fn default_mdx(title: &str, _slug: &str) -> String {
    let t = yaml_string(title);
    format!("---\ntitle: {t}\n---\n\n# {title}\n\n开始写作…\n")
}

/// YAML 双引号字符串转义（仅转义反斜杠与双引号）。
fn yaml_string(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

// ===== 命令 =====

/// 新建文章：写入 `<空间>/content/<slug>.mdx`。
/// `slug` 作为文件名、必须唯一；`title` 存入 frontmatter 作为展示标题。
/// 保存前校验 slug 唯一——已存在同 slug 文章则返回 `ARTICLE_EXISTS` 错误并**禁止覆盖**。
#[tauri::command]
pub fn article_create(
    _app: AppHandle,
    space_path: String,
    title: String,
    slug: String,
) -> Result<CreateArticleData, ArticleError> {
    let slug = validate_slug(&slug)?;
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(ArticleError::new(
            ArticleErrorCode::InvalidName,
            "文章标题不能为空",
        ));
    }
    let content_dir = content_dir_for(&space_path)?;

    if article_slug_exists(&content_dir, &slug) {
        return Err(ArticleError::new(
            ArticleErrorCode::ArticleExists,
            format!("已存在 slug 为「{slug}」的文章，slug（文件名）必须唯一，无法覆盖已有文件"),
        ));
    }

    let path = mdx_path(&content_dir, &slug);
    fs::write(&path, default_mdx(&title, &slug))
        .map_err(|e| from_io_error(&e, "写入文章文件失败"))?;

    let article = meta_of(&path, &slug)?;
    Ok(CreateArticleData { article })
}

/// 由标题生成 slug：用 `pinyin-converter` 做词典分词 + 转写 + 去声调 + `-` 连接，
/// 再用 rslug 做小写、截断与最终清理（拉丁文/符号也由 rslug 统一处理），
/// 产出可直接作文件名的 ASCII URL 友好串（带 `-` 分隔符）。
///
/// `pinyin-converter::Pinyin::permalink` 已一次性完成：最长匹配分词 → 转拼音 →
/// 去声调（ü→v）→ 去标点 → 以 `-` 连接；rslug 负责截断（≤128）与清掉极少数字典
/// 未收录而残留在结果里的字符。仅用于前端「根据标题生成」的便捷入口，
/// 最终保存时仍由 `validate_slug` + 唯一性校验把关。
///
/// 例：
/// - `我的第一篇文章`  → `wo-de-di-yi-pian-wen-zhang`
/// - `你好世界 & Rust` → `ni-hao-shi-jie-rust`
/// - `Hello World!`    → `hello-world`
#[tauri::command]
pub fn article_slugify(_app: AppHandle, title: String) -> ArticleSlugifyData {
    let slug = Slugifier::new()
        .truncate(MAX_NAME_LENGTH)
        .slugify(&Pinyin::permalink(title.trim()));
    ArticleSlugifyData { slug }
}

/// 遍历 `content` 目录，收集全部 `.mdx` 文章元信息（按名称排序）。
fn collect_articles(content_dir: &Path) -> Result<Vec<ArticleMeta>, ArticleError> {
    let mut articles: Vec<ArticleMeta> = Vec::new();
    if !content_dir.is_dir() {
        return Ok(articles);
    }
    let entries = fs::read_dir(content_dir).map_err(|e| from_io_error(&e, "读取文章目录失败"))?;
    for entry in entries {
        let entry = entry.map_err(|e| from_io_error(&e, "读取文章目录失败"))?;
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some(MDX_EXT) || !p.is_file() {
            continue;
        }
        let stem = match p.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        if let Ok(meta) = meta_of(&p, &stem) {
            articles.push(meta);
        }
    }
    articles.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(articles)
}

/// 列出空间下全部文章（遍历 `content/*.mdx`）。目录不存在视为空列表。
#[tauri::command]
pub fn article_list(
    _app: AppHandle,
    space_path: String,
) -> Result<ArticleListData, ArticleError> {
    let content_dir = content_dir_for(&space_path)?;
    let articles = collect_articles(&content_dir)?;
    Ok(ArticleListData { articles })
}

/// 删除文章：成功返回刷新后的列表。文件不存在返回 `NOT_FOUND`。
/// `slug` 即文件名（不含扩展名）。
#[tauri::command]
pub fn article_delete(
    _app: AppHandle,
    space_path: String,
    slug: String,
) -> Result<ArticleListData, ArticleError> {
    let slug = validate_slug(&slug)?;
    let content_dir = content_dir_for(&space_path)?;
    let path = mdx_path(&content_dir, &slug);

    if !path.exists() {
        return Err(ArticleError::new(
            ArticleErrorCode::NotFound,
            format!("文章「{slug}」不存在"),
        ));
    }
    fs::remove_file(&path).map_err(|e| from_io_error(&e, "删除文章失败"))?;

    let articles = collect_articles(&content_dir)?;
    Ok(ArticleListData { articles })
}
