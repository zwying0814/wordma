use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::article::Article;
use crate::pages::Page;

#[derive(Clone, Copy, Debug)]
pub enum ContentKind {
    Article,
    Page,
}

impl ContentKind {
    fn as_str(self) -> &'static str {
        match self {
            ContentKind::Article => "article",
            ContentKind::Page => "page",
        }
    }
}

#[derive(Serialize)]
struct RenderInput {
    kind: &'static str,
    id: i64,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderRequest<'a> {
    workspace: &'a str,
    runtime_path: Option<&'a str>,
    items: &'a [RenderInput],
}

#[derive(Deserialize)]
struct RenderOutput {
    kind: String,
    id: i64,
    ok: bool,
    html: Option<String>,
    #[serde(default, rename = "feedHtml")]
    feed_html: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenderAsset {
    pub path: String,
    pub contents: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderWarning {
    pub kind: String,
    pub id: i64,
    #[serde(default)]
    pub block_id: Option<String>,
    pub message: String,
}

#[derive(Deserialize)]
struct RenderResponse {
    #[serde(default)]
    items: Vec<RenderOutput>,
    #[serde(default)]
    assets: Vec<RenderAsset>,
    #[serde(default)]
    warnings: Vec<RenderWarning>,
}

/// 一次站点渲染中，Bun 渲染出的正文 HTML（按文章/页面分桶）
#[derive(Default)]
pub struct RenderedContent {
    pub(crate) articles: HashMap<i64, String>,
    pub(crate) pages: HashMap<i64, String>,
    pub(crate) feed_articles: HashMap<i64, String>,
    pub(crate) feed_pages: HashMap<i64, String>,
    pub(crate) assets: Vec<RenderAsset>,
    pub(crate) warnings: Vec<RenderWarning>,
}

impl RenderedContent {
    fn bucket(&mut self, kind: ContentKind) -> &mut HashMap<i64, String> {
        match kind {
            ContentKind::Article => &mut self.articles,
            ContentKind::Page => &mut self.pages,
        }
    }

    fn feed_bucket(&mut self, kind: ContentKind) -> &mut HashMap<i64, String> {
        match kind {
            ContentKind::Article => &mut self.feed_articles,
            ContentKind::Page => &mut self.feed_pages,
        }
    }

    fn get(&self, kind: ContentKind, id: i64) -> Option<&String> {
        match kind {
            ContentKind::Article => self.articles.get(&id),
            ContentKind::Page => self.pages.get(&id),
        }
    }

    fn feed_get(&self, kind: ContentKind, id: i64) -> Option<&String> {
        match kind {
            ContentKind::Article => self.feed_articles.get(&id).or_else(|| self.articles.get(&id)),
            ContentKind::Page => self.feed_pages.get(&id).or_else(|| self.pages.get(&id)),
        }
    }
}

/// 取正文 HTML。生产路径会为每个条目写入结果（失败项写占位 HTML）；
/// 测试等无 Bun 场景返回空串。
pub fn rendered_html(
    rendered: Option<&RenderedContent>,
    kind: ContentKind,
    id: i64,
) -> String {
    rendered
        .and_then(|r| r.get(kind, id))
        .cloned()
        .unwrap_or_default()
}

/// 取 feed 用正文（无 MDX 脚本/样式），缺失时回退到普通正文
pub fn rendered_feed_html(
    rendered: Option<&RenderedContent>,
    kind: ContentKind,
    id: i64,
) -> String {
    rendered
        .and_then(|r| r.feed_get(kind, id))
        .cloned()
        .unwrap_or_default()
}

/// 站点内所有正文一次性交给 Bun 渲染
pub fn render_site_content(
    app: &AppHandle,
    site_id: i64,
    articles: &[Article],
    pages: &[Page],
) -> Result<RenderedContent, String> {
    let mut items: Vec<RenderInput> = Vec::new();
    for article in articles {
        items.push(RenderInput {
            kind: ContentKind::Article.as_str(),
            id: article.id,
            content: article.content.clone(),
        });
    }
    for page in pages {
        items.push(RenderInput {
            kind: ContentKind::Page.as_str(),
            id: page.id,
            content: page.content.clone(),
        });
    }
    if items.is_empty() {
        return Ok(RenderedContent::default());
    }

    let workspace = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("mdx")
        .join(site_id.to_string());
    std::fs::create_dir_all(&workspace)
        .map_err(|e| format!("创建 MDX 工作区失败: {e}"))?;
    let workspace = workspace.to_string_lossy().to_string();
    let runtime_path = crate::mdx::mdx_runtime_source(app)
        .ok()
        .map(|path| path.to_string_lossy().to_string());

    let request = RenderRequest {
        workspace: &workspace,
        runtime_path: runtime_path.as_deref(),
        items: &items,
    };
    let response = run_renderer(app, &request)?;
    let mut rendered = RenderedContent {
        assets: response.assets,
        warnings: response.warnings,
        ..Default::default()
    };
    for output in response.items {
        let kind = match output.kind.as_str() {
            "article" => ContentKind::Article,
            "page" => ContentKind::Page,
            _ => continue,
        };
        let html = match (output.ok, output.html) {
            (true, Some(html)) => html,
            _ => error_html(output.error.as_deref().unwrap_or("渲染器未返回内容")),
        };
        let feed = output.feed_html.unwrap_or_else(|| html.clone());
        rendered.bucket(kind).insert(output.id, html);
        rendered.feed_bucket(kind).insert(output.id, feed);
    }

    // 渲染器漏返回的条目也补错误占位，避免整站空白
    for item in &items {
        let kind = if item.kind == "article" {
            ContentKind::Article
        } else {
            ContentKind::Page
        };
        let fallback = error_html("渲染器未返回该条目");
        rendered.bucket(kind).entry(item.id).or_insert(fallback.clone());
        rendered.feed_bucket(kind).entry(item.id).or_insert(fallback);
    }

    Ok(rendered)
}

fn run_renderer(
    app: &AppHandle,
    request: &RenderRequest<'_>,
) -> Result<RenderResponse, String> {
    let bun = resolve_bun()?;
    let entry = renderer_entry(app)?;
    run_renderer_process(&bun, &entry, request)
}

fn run_renderer_process(
    bun: &Path,
    entry: &Path,
    request: &RenderRequest<'_>,
) -> Result<RenderResponse, String> {
    let payload =
        serde_json::to_string(request).map_err(|e| format!("序列化渲染请求失败: {e}"))?;

    let mut child = Command::new(bun)
        .env_remove("NODE_PATH")
        .arg(entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "启动 Bun 内容渲染器失败（{}）：{e}。请运行 `pnpm -F desktop fetch:bun`",
                bun.display()
            )
        })?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "无法写入渲染器标准输入".to_string())?
        .write_all(payload.as_bytes())
        .map_err(|e| format!("写入渲染请求失败: {e}"))?;
    drop(child.stdin.take());

    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待 Bun 渲染器失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("内容渲染失败：{}", stderr.trim()));
    }
    serde_json::from_slice::<RenderResponse>(&output.stdout)
        .map_err(|e| format!("解析渲染结果失败: {e}"))
}

pub(crate) fn resolve_bun() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("WORDMA_BUN") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }

    // 发布态：Tauri externalBin 与主程序同目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["bun", "bun.exe"] {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

    // 开发态：仓库内预置二进制
    if cfg!(debug_assertions) {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(bun_binary_name());
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let fallback = PathBuf::from(if cfg!(windows) { "bun.exe" } else { "bun" });
    if Command::new(&fallback).arg("--version").output().is_ok() {
        return Ok(fallback);
    }

    Err("找不到 Bun 运行时。请运行 `pnpm -F desktop fetch:bun`，或设置 WORDMA_BUN 环境变量".into())
}

fn bun_binary_name() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "bun-aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "bun-x86_64-apple-darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "bun-x86_64-pc-windows-msvc.exe"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "bun-aarch64-unknown-linux-gnu"
    } else {
        "bun-x86_64-unknown-linux-gnu"
    }
}

fn renderer_entry(app: &AppHandle) -> Result<PathBuf, String> {
    // 开发态优先源码，避免用到 resources 里过期的打包产物
    if cfg!(debug_assertions) {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/cli.ts");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("content-renderer").join("cli.js");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("找不到内容渲染器（content-renderer/cli.js），请重新构建应用".into())
}

fn error_html(message: &str) -> String {
    format!(
        "<div class=\"wordma-content-error\"><strong>内容渲染失败</strong><p>{}</p></div>",
        escape_html(message)
    )
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rendered_html_prefers_map_and_falls_back() {
        let mut rendered = RenderedContent::default();
        rendered
            .articles
            .insert(1, "<p>来自 Bun</p>".to_string());

        assert_eq!(
            rendered_html(Some(&rendered), ContentKind::Article, 1),
            "<p>来自 Bun</p>"
        );
        assert_eq!(rendered_html(Some(&rendered), ContentKind::Article, 2), "");
        assert_eq!(rendered_html(None, ContentKind::Article, 2), "");
    }

    #[test]
    fn rendered_feed_html_falls_back_to_body() {
        let mut rendered = RenderedContent::default();
        rendered.articles.insert(1, "<p>正文</p>".to_string());
        rendered
            .feed_articles
            .insert(2, "<p>feed</p>".to_string());
        assert_eq!(
            rendered_feed_html(Some(&rendered), ContentKind::Article, 1),
            "<p>正文</p>"
        );
        assert_eq!(
            rendered_feed_html(Some(&rendered), ContentKind::Article, 2),
            "<p>feed</p>"
        );
        assert_eq!(rendered_feed_html(None, ContentKind::Article, 1), "");
    }

    #[test]
    fn bun_renderer_roundtrip() {
        let bun = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(bun_binary_name());
        let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/cli.ts");
        if !bun.is_file() || !entry.is_file() {
            return;
        }
        let workspace =
            std::env::temp_dir().join(format!("wordma-render-{}", std::process::id()));
        std::fs::create_dir_all(&workspace).unwrap();
        let items = vec![RenderInput {
            kind: "article",
            id: 1,
            content: r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"你好"}]}]}"#.to_string(),
        }];
        let request = RenderRequest {
            workspace: workspace.to_str().unwrap(),
            runtime_path: None,
            items: &items,
        };
        let output = run_renderer_process(&bun, &entry, &request).unwrap();
        let _ = std::fs::remove_dir_all(&workspace);
        assert_eq!(output.items.len(), 1);
        assert!(output.items[0].ok);
        assert_eq!(output.items[0].html.as_deref(), Some("<p>你好</p>"));
        assert!(output.assets.is_empty());
    }

    #[test]
    fn bun_renderer_mdx_assets_and_feed() {
        let bun = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(bun_binary_name());
        let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/cli.ts");
        let runtime = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources/content-renderer/mdx-runtime.js");
        if !bun.is_file() || !entry.is_file() || !runtime.is_file() {
            return;
        }
        let workspace =
            std::env::temp_dir().join(format!("wordma-render-mdx-{}", std::process::id()));
        std::fs::create_dir_all(&workspace).unwrap();
        let content = serde_json::json!({
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "前言" }] },
                { "type": "mdxBlock", "attrs": { "blockId": "mdx_1", "source": "## 你好" } }
            ]
        })
        .to_string();
        let items = vec![RenderInput {
            kind: "article",
            id: 7,
            content,
        }];
        let request = RenderRequest {
            workspace: workspace.to_str().unwrap(),
            runtime_path: runtime.to_str(),
            items: &items,
        };
        let output = run_renderer_process(&bun, &entry, &request).unwrap();
        let _ = std::fs::remove_dir_all(&workspace);

        assert_eq!(output.items.len(), 1);
        let html = output.items[0].html.as_deref().unwrap();
        assert!(html.contains("data-wordma-mdx=\"article-7-0\""));
        assert!(html.contains("<script type=\"module\">"));
        assert!(html.contains("/assets/mdx/entry-"));
        let feed = output.items[0].feed_html.as_deref().unwrap();
        assert!(!feed.contains("<script"));
        assert!(feed.contains("MDX 内容需要 JavaScript"));
        assert!(output
            .assets
            .iter()
            .any(|asset| asset.path == "assets/mdx/react.js"));
        assert!(output
            .assets
            .iter()
            .any(|asset| asset.path.starts_with("assets/mdx/entry-")));
        assert!(output.warnings.is_empty());
    }
}
