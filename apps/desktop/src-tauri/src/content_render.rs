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

#[derive(Deserialize)]
struct RenderOutput {
    kind: String,
    id: i64,
    ok: bool,
    html: Option<String>,
    error: Option<String>,
}

/// 一次站点渲染中，Bun 渲染出的正文 HTML（按文章/页面分桶）
#[derive(Default)]
pub struct RenderedContent {
    pub(crate) articles: HashMap<i64, String>,
    pub(crate) pages: HashMap<i64, String>,
}

impl RenderedContent {
    fn bucket(&mut self, kind: ContentKind) -> &mut HashMap<i64, String> {
        match kind {
            ContentKind::Article => &mut self.articles,
            ContentKind::Page => &mut self.pages,
        }
    }

    fn get(&self, kind: ContentKind, id: i64) -> Option<&String> {
        match kind {
            ContentKind::Article => self.articles.get(&id),
            ContentKind::Page => self.pages.get(&id),
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

/// 站点内所有正文一次性交给 Bun 渲染
pub fn render_site_content(
    app: &AppHandle,
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

    let outputs = run_renderer(app, &items)?;
    let mut rendered = RenderedContent::default();
    for output in outputs {
        let kind = match output.kind.as_str() {
            "article" => ContentKind::Article,
            "page" => ContentKind::Page,
            _ => continue,
        };
        let html = match (output.ok, output.html) {
            (true, Some(html)) => html,
            _ => error_html(output.error.as_deref().unwrap_or("渲染器未返回内容")),
        };
        rendered.bucket(kind).insert(output.id, html);
    }

    // 渲染器漏返回的条目也补错误占位，避免整站空白
    for item in &items {
        let kind = if item.kind == "article" {
            ContentKind::Article
        } else {
            ContentKind::Page
        };
        rendered
            .bucket(kind)
            .entry(item.id)
            .or_insert_with(|| error_html("渲染器未返回该条目"));
    }

    Ok(rendered)
}

fn run_renderer(app: &AppHandle, items: &[RenderInput]) -> Result<Vec<RenderOutput>, String> {
    let bun = resolve_bun()?;
    let entry = renderer_entry(app)?;
    run_renderer_process(&bun, &entry, items)
}

fn run_renderer_process(
    bun: &Path,
    entry: &Path,
    items: &[RenderInput],
) -> Result<Vec<RenderOutput>, String> {
    let payload =
        serde_json::to_string(items).map_err(|e| format!("序列化渲染请求失败: {e}"))?;

    let mut child = Command::new(bun)
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
    serde_json::from_slice::<Vec<RenderOutput>>(&output.stdout)
        .map_err(|e| format!("解析渲染结果失败: {e}"))
}

fn resolve_bun() -> Result<PathBuf, String> {
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
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("content-renderer").join("cli.js");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if cfg!(debug_assertions) {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/cli.ts");
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
    fn bun_renderer_roundtrip() {
        let bun = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(bun_binary_name());
        let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/cli.ts");
        if !bun.is_file() || !entry.is_file() {
            return;
        }
        let items = vec![RenderInput {
            kind: "article",
            id: 1,
            content: r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"你好"}]}]}"#.to_string(),
        }];
        let output = run_renderer_process(&bun, &entry, &items).unwrap();
        assert_eq!(output.len(), 1);
        assert!(output[0].ok);
        assert_eq!(output[0].html.as_deref(), Some("<p>你好</p>"));
    }
}
