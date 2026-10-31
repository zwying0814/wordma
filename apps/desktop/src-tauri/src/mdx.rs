use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::article::MDX_SOURCE_LIMIT;
use crate::content_render::resolve_bun;
use crate::db::Db;
use crate::theme::prepare_preview_site;

const COMPILE_TIMEOUT: Duration = Duration::from_secs(15);

static COMPILE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileRequest<'a> {
    workspace: &'a str,
    block_id: &'a str,
    source: &'a str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MdxCompileError {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub frame: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MdxCompileResult {
    pub ok: bool,
    pub hash: Option<String>,
    pub code: Option<String>,
    pub css: Option<String>,
    pub url: Option<String>,
    pub error: Option<MdxCompileError>,
}

impl MdxCompileResult {
    fn failure(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            hash: None,
            code: None,
            css: None,
            url: None,
            error: Some(MdxCompileError {
                message: message.into(),
                line: None,
                column: None,
                frame: None,
            }),
        }
    }
}

/// 校验并编译单个 MDX 块；编译失败以结构化结果返回，环境错误才返回 Err。
#[tauri::command]
pub fn compile_mdx_cmd(
    app: AppHandle,
    db: State<Db>,
    site_id: i64,
    block_id: String,
    source: String,
) -> Result<MdxCompileResult, String> {
    if source.len() > MDX_SOURCE_LIMIT {
        return Ok(MdxCompileResult::failure(format!(
            "MDX 源码超过 {} KB 上限",
            MDX_SOURCE_LIMIT / 1024
        )));
    }

    let workspace = ensure_mdx_workspace(&app, site_id)?;
    let bun = resolve_bun()?;
    let entry = mdx_preview_entry(&app)?;
    let _guard = COMPILE_LOCK
        .lock()
        .map_err(|_| "MDX 编译锁异常".to_string())?;
    let mut result = run_preview(&bun, &entry, &workspace, &block_id, &source)?;
    if !result.ok {
        return Ok(result);
    }

    let hash = result
        .hash
        .clone()
        .ok_or_else(|| "MDX 编译结果缺少 hash".to_string())?;
    let code = result
        .code
        .clone()
        .ok_or_else(|| "MDX 编译结果缺少代码".to_string())?;
    let (port, dist) = {
        let conn = db
            .0
            .lock()
            .map_err(|e| format!("数据库连接不可用: {e}"))?;
        prepare_preview_site(&app, &conn, site_id)?
    };

    copy_runtime(&app, &dist)?;
    write_preview_files(&dist, &hash, &code, result.css.as_deref())?;
    result.url = Some(format!(
        "http://127.0.0.1:{port}/__mdx-preview/{hash}/"
    ));
    prune_preview_dirs(&dist.join("__mdx-preview"), 30);
    Ok(result)
}

pub(crate) fn ensure_mdx_workspace(
    app: &AppHandle,
    site_id: i64,
) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("mdx")
        .join(site_id.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 MDX 工作区失败: {e}"))?;
    let package = dir.join("package.json");
    if !package.is_file() {
        let value = json!({
            "name": format!("wordma-mdx-site-{site_id}"),
            "private": true,
            "dependencies": {}
        });
        std::fs::write(
            &package,
            serde_json::to_string_pretty(&value)
                .map_err(|e| format!("生成 MDX package.json 失败: {e}"))?,
        )
        .map_err(|e| format!("写入 MDX package.json 失败: {e}"))?;
    }
    Ok(dir)
}


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MdxDependency {
    pub name: String,
    pub spec: String,
    pub version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MdxDepsReport {
    pub workspace: String,
    pub dependencies: Vec<MdxDependency>,
    pub installed: bool,
    pub output: String,
}

#[tauri::command]
pub fn list_mdx_deps_cmd(app: AppHandle, site_id: i64) -> Result<MdxDepsReport, String> {
    let workspace = ensure_mdx_workspace(&app, site_id)?;
    deps_report(&workspace, String::new())
}

#[tauri::command]
pub fn install_mdx_deps_cmd(app: AppHandle, site_id: i64) -> Result<MdxDepsReport, String> {
    let workspace = ensure_mdx_workspace(&app, site_id)?;
    let bun = resolve_bun()?;
    let _guard = COMPILE_LOCK
        .lock()
        .map_err(|_| "MDX 依赖锁异常".to_string())?;
    let output = run_bun_install(&bun, &workspace)?;
    deps_report(&workspace, output)
}

#[tauri::command]
pub fn add_mdx_dependency_cmd(
    app: AppHandle,
    site_id: i64,
    name: String,
    version: Option<String>,
) -> Result<MdxDepsReport, String> {
    validate_dependency_name(&name)?;
    let spec = version
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "latest".to_string());
    validate_dependency_spec(&spec)?;

    let workspace = ensure_mdx_workspace(&app, site_id)?;
    let package_path = workspace.join("package.json");
    let original = std::fs::read_to_string(&package_path)
        .map_err(|e| format!("读取 MDX package.json 失败: {e}"))?;
    let mut package = read_package(&workspace)?;
    let object = package
        .as_object_mut()
        .ok_or_else(|| "MDX package.json 必须是对象".to_string())?;
    let dependencies = object
        .entry("dependencies")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| "MDX package.json 的 dependencies 必须是对象".to_string())?;
    dependencies.insert(name.clone(), json!(spec));
    write_package(&workspace, &package)?;

    let bun = resolve_bun()?;
    let _guard = COMPILE_LOCK
        .lock()
        .map_err(|_| "MDX 依赖锁异常".to_string())?;
    match run_bun_install(&bun, &workspace) {
        Ok(output) => deps_report(&workspace, output),
        Err(error) => {
            let _ = std::fs::write(&package_path, original);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn remove_mdx_dependency_cmd(
    app: AppHandle,
    site_id: i64,
    name: String,
) -> Result<MdxDepsReport, String> {
    validate_dependency_name(&name)?;
    let workspace = ensure_mdx_workspace(&app, site_id)?;
    let package_path = workspace.join("package.json");
    let original = std::fs::read_to_string(&package_path)
        .map_err(|e| format!("读取 MDX package.json 失败: {e}"))?;
    let mut package = read_package(&workspace)?;
    let mut removed = false;
    if let Some(dependencies) = package
        .get_mut("dependencies")
        .and_then(|value| value.as_object_mut())
    {
        removed = dependencies.remove(&name).is_some();
    }
    if !removed {
        return deps_report(&workspace, String::new());
    }
    write_package(&workspace, &package)?;

    let bun = resolve_bun()?;
    let _guard = COMPILE_LOCK
        .lock()
        .map_err(|_| "MDX 依赖锁异常".to_string())?;
    match run_bun_install(&bun, &workspace) {
        Ok(output) => deps_report(&workspace, output),
        Err(error) => {
            let _ = std::fs::write(&package_path, original);
            Err(error)
        }
    }
}

fn read_package(workspace: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(workspace.join("package.json"))
        .map_err(|e| format!("读取 MDX package.json 失败: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("MDX package.json 格式错误: {e}"))
}

fn write_package(workspace: &Path, package: &Value) -> Result<(), String> {
    let text = serde_json::to_string_pretty(package)
        .map_err(|e| format!("生成 MDX package.json 失败: {e}"))?;
    std::fs::write(workspace.join("package.json"), text)
        .map_err(|e| format!("写入 MDX package.json 失败: {e}"))
}

fn deps_report(workspace: &Path, output: String) -> Result<MdxDepsReport, String> {
    let package = read_package(workspace)?;
    let mut dependencies = Vec::new();
    if let Some(map) = package.get("dependencies").and_then(|value| value.as_object()) {
        for (name, spec) in map {
            dependencies.push(MdxDependency {
                name: name.clone(),
                spec: spec.as_str().unwrap_or("*").to_string(),
                version: installed_version(workspace, name),
            });
        }
    }
    dependencies.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(MdxDepsReport {
        workspace: workspace.display().to_string(),
        dependencies,
        installed: workspace.join("node_modules").is_dir(),
        output,
    })
}

fn installed_version(workspace: &Path, name: &str) -> Option<String> {
    validate_dependency_name(name).ok()?;
    let text = std::fs::read_to_string(
        workspace
            .join("node_modules")
            .join(name)
            .join("package.json"),
    )
    .ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value
        .get("version")
        .and_then(|version| version.as_str())
        .map(str::to_string)
}

fn validate_dependency_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 214 {
        return Err("包名长度不合法".into());
    }
    if name.starts_with('.') || name.starts_with('-') {
        return Err("包名不能以 . 或 - 开头".into());
    }
    if name.contains("..")
        || name.contains('\\')
        || name.contains(':')
        || name.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("包名包含非法字符".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '@' | '/'))
    {
        return Err("包名包含非法字符".into());
    }
    let slashes = name.matches('/').count();
    if name.starts_with('@') {
        if slashes != 1 || name.ends_with('/') || name.starts_with("@/") {
            return Err("作用域包名格式应为 @scope/name".into());
        }
    } else if slashes != 0 {
        return Err("包名格式不正确".into());
    }
    Ok(())
}

fn validate_dependency_spec(spec: &str) -> Result<(), String> {
    if spec.is_empty() || spec.len() > 64 {
        return Err("版本号长度不合法".into());
    }
    if !spec.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || matches!(c, '.' | '^' | '~' | '<' | '>' | '=' | '*' | '+' | '-' | '|')
    }) {
        return Err("版本号包含非法字符".into());
    }
    if spec.starts_with('-') || spec.starts_with('.') {
        return Err("版本号格式不正确".into());
    }
    Ok(())
}

fn run_bun_install(bun: &Path, workspace: &Path) -> Result<String, String> {
    let mut child = Command::new(bun)
        .env_remove("NODE_PATH")
        .args(["install", "--ignore-scripts"])
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "启动依赖安装失败（{}）：{e}。请运行 `pnpm -F desktop fetch:bun`",
                bun.display()
            )
        })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取依赖安装输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取依赖安装错误输出".to_string())?;
    let out_reader = std::thread::spawn(move || read_all(stdout));
    let err_reader = std::thread::spawn(move || read_all(stderr));

    let deadline = Instant::now() + Duration::from_secs(120);
    let status = loop {
        match child
            .try_wait()
            .map_err(|e| format!("等待依赖安装失败: {e}"))?
        {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = out_reader.join();
                let _ = err_reader.join();
                return Err("MDX 依赖安装超时（120 秒）".into());
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    };

    let stdout = out_reader.join().unwrap_or_default();
    let stderr = err_reader.join().unwrap_or_default();
    let mut output = String::from_utf8_lossy(&stdout).to_string();
    let error_text = String::from_utf8_lossy(&stderr);
    if !error_text.trim().is_empty() {
        if !output.is_empty() {
            output.push('\n');
        }
        output.push_str(error_text.trim());
    }
    if !status.success() {
        return Err(format!("MDX 依赖安装失败：{}", truncate_output(&output)));
    }
    Ok(truncate_output(&output))
}

fn truncate_output(value: &str) -> String {
    value.chars().take(8000).collect()
}

fn mdx_preview_entry(app: &AppHandle) -> Result<PathBuf, String> {
    // 开发态优先源码，避免用到 resources 里过期的打包产物
    if cfg!(debug_assertions) {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/mdx-preview.ts");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("content-renderer").join("mdx-preview.js");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("找不到 MDX 编译器（content-renderer/mdx-preview.js），请重新构建应用".into())
}

pub(crate) fn mdx_runtime_source(app: &AppHandle) -> Result<PathBuf, String> {    if cfg!(debug_assertions) {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources/content-renderer/mdx-runtime.js");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("content-renderer").join("mdx-runtime.js");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("找不到 MDX 运行时（content-renderer/mdx-runtime.js），请重新构建应用".into())
}

fn copy_runtime(app: &AppHandle, dist: &Path) -> Result<(), String> {
    let source = mdx_runtime_source(app)?;
    let target = dist.join("assets").join("mdx").join("react.js");
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建 MDX 资源目录失败: {e}"))?;
    }
    std::fs::copy(&source, &target).map_err(|e| {
        format!(
            "复制 MDX 运行时失败（{} -> {}）: {e}",
            source.display(),
            target.display()
        )
    })?;
    Ok(())
}

fn write_preview_files(
    dist: &Path,
    hash: &str,
    code: &str,
    css: Option<&str>,
) -> Result<(), String> {
    let dir = dist.join("__mdx-preview").join(hash);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 MDX 预览目录失败: {e}"))?;
    std::fs::write(dir.join("entry.js"), code)
        .map_err(|e| format!("写入 MDX 预览入口失败: {e}"))?;
    if let Some(css) = css {
        std::fs::write(dir.join("entry.css"), css)
            .map_err(|e| format!("写入 MDX 预览样式失败: {e}"))?;
    }
    std::fs::write(dir.join("mount.js"), PREVIEW_MOUNT_JS)
        .map_err(|e| format!("写入 MDX 预览挂载脚本失败: {e}"))?;
    std::fs::write(dir.join("index.html"), preview_html(css.is_some()))
        .map_err(|e| format!("写入 MDX 预览页面失败: {e}"))?;
    Ok(())
}

const PREVIEW_MOUNT_JS: &str = r#"
const report = (message) => {
  try { parent.postMessage({ type: "wordma-mdx-error", message }, "*"); } catch {}
};
window.addEventListener("error", (event) =>
  report(String(event.message || event.error || "MDX 运行失败")),
);
window.addEventListener("unhandledrejection", (event) =>
  report(String(event.reason || "MDX 运行失败")),
);
import("./entry.js")
  .then((mod) => {
    mod.mount(document.getElementById("root"));
    parent.postMessage({ type: "wordma-mdx-ready" }, "*");
  })
  .catch((error) => report(String(error && error.message || error)));
"#;

fn preview_html(has_css: bool) -> String {
    let css_link = if has_css {
        r#"<link rel="stylesheet" href="./entry.css">"#
    } else {
        ""
    };
    format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; font-src 'self' data: https:; connect-src http: https:; media-src 'self' http: https:; frame-src 'none'; base-uri 'none'; form-action 'none';">
<style>
html, body {{ margin: 0; padding: 0; }}
body {{ padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2328; font-size: 15px; line-height: 1.7; }}
h1, h2, h3, h4 {{ line-height: 1.3; margin: 1.1em 0 0.45em; }}
h1:first-child, h2:first-child, h3:first-child, p:first-child {{ margin-top: 0; }}
p {{ margin: 0.55em 0; }}
pre {{ background: #f6f8fa; padding: 12px; border-radius: 6px; overflow: auto; }}
code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }}
pre code {{ font-size: 0.9em; }}
:not(pre) > code {{ background: #f6f8fa; padding: 0.15em 0.35em; border-radius: 4px; }}
img {{ max-width: 100%; height: auto; }}
#root {{ min-height: 1px; }}
</style>
{css_link}
</head>
<body>
<div id="root"></div>
<script type="module" src="./mount.js"></script>
</body>
</html>"#
    )
}

fn prune_preview_dirs(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();
    if dirs.len() <= keep {
        return;
    }
    dirs.sort_by_key(|(modified, _)| *modified);
    let remove_count = dirs.len() - keep;
    for (_, path) in dirs.into_iter().take(remove_count) {
        let _ = std::fs::remove_dir_all(path);
    }
}

fn run_preview(
    bun: &Path,
    entry: &Path,
    workspace: &Path,
    block_id: &str,
    source: &str,
) -> Result<MdxCompileResult, String> {
    let workspace = workspace
        .to_str()
        .ok_or_else(|| "MDX 工作区路径包含非法字符".to_string())?;
    let payload = serde_json::to_vec(&CompileRequest {
        workspace,
        block_id,
        source,
    })
    .map_err(|e| format!("序列化 MDX 编译请求失败: {e}"))?;

    let mut child = Command::new(bun)
        .env_remove("NODE_PATH")
        .arg(entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "启动 MDX 编译器失败（{}）：{e}。请运行 `pnpm -F desktop fetch:bun`",
                bun.display()
            )
        })?;

    child
        .stdin
        .as_mut()
        .ok_or_else(|| "无法写入 MDX 编译器标准输入".to_string())?
        .write_all(&payload)
        .map_err(|e| format!("写入 MDX 编译请求失败: {e}"))?;
    drop(child.stdin.take());

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 MDX 编译器标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 MDX 编译器错误输出".to_string())?;
    let out_reader = std::thread::spawn(move || read_all(stdout));
    let err_reader = std::thread::spawn(move || read_all(stderr));

    let deadline = Instant::now() + COMPILE_TIMEOUT;
    let status = loop {
        match child
            .try_wait()
            .map_err(|e| format!("等待 MDX 编译失败: {e}"))?
        {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = out_reader.join();
                let _ = err_reader.join();
                return Err(format!(
                    "MDX 编译超时（{} 秒）",
                    COMPILE_TIMEOUT.as_secs()
                ));
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    };

    let stdout = out_reader.join().unwrap_or_default();
    let stderr = err_reader.join().unwrap_or_default();
    if !status.success() {
        let message = String::from_utf8_lossy(&stderr);
        return Err(format!("MDX 编译进程失败：{}", message.trim()));
    }

    serde_json::from_slice::<MdxCompileResult>(&stdout).map_err(|e| {
        let stderr = String::from_utf8_lossy(&stderr);
        format!("解析 MDX 编译结果失败: {e}；stderr: {}", stderr.trim())
    })
}

fn read_all(mut stream: impl Read) -> Vec<u8> {
    let mut buffer = Vec::new();
    let _ = stream.read_to_end(&mut buffer);
    buffer
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workspace(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "wordma-mdx-{label}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn bun_and_entry() -> Option<(PathBuf, PathBuf)> {
        let bun = resolve_bun().ok()?;
        let entry = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/content-renderer/src/mdx-preview.ts");
        if !entry.is_file() {
            return None;
        }
        Some((bun, entry))
    }

    #[test]
    fn mdx_compile_roundtrip() {
        let Some((bun, entry)) = bun_and_entry() else {
            return;
        };
        let workspace = temp_workspace("ok");
        let result = run_preview(
            &bun,
            &entry,
            &workspace,
            "mdx_test",
            "## 标题\n\n<button type=\"button\">点我</button>\n",
        )
        .unwrap();
        let _ = std::fs::remove_dir_all(&workspace);

        assert!(result.ok, "{:?}", result.error);
        assert_eq!(result.hash.as_deref().map(str::len), Some(64));
        let code = result.code.unwrap();
        assert!(code.contains("createRoot"));
        assert!(code.contains("mount"));
        assert!(code.contains("/assets/mdx/react.js"));
        assert!(result.css.is_none());
    }

    #[test]
    fn mdx_compile_reports_syntax_error() {
        let Some((bun, entry)) = bun_and_entry() else {
            return;
        };
        let workspace = temp_workspace("bad");
        let result = run_preview(&bun, &entry, &workspace, "mdx_bad", "# 标题\n\n<").unwrap();
        let _ = std::fs::remove_dir_all(&workspace);

        assert!(!result.ok);
        let error = result.error.unwrap();
        assert!(!error.message.trim().is_empty());
        assert!(error.line.is_some(), "{error:?}");
    }

    #[test]
    fn preview_html_contains_csp_and_mount_script() {
        let html = preview_html(true);
        assert!(html.contains("Content-Security-Policy"));
        assert!(html.contains("default-src 'none'"));
        assert!(html.contains("script-src 'self'"));
        assert!(html.contains("entry.css"));
        assert!(html.contains("mount.js"));
        assert!(PREVIEW_MOUNT_JS.contains("mod.mount"));
    }

    #[test]
    fn validates_dependency_names_and_specs() {
        assert!(validate_dependency_name("nanoid").is_ok());
        assert!(validate_dependency_name("@scope/pkg").is_ok());
        assert!(validate_dependency_name("@scope/pkg-name").is_ok());
        assert!(validate_dependency_name("lodash.get").is_ok());
        assert!(validate_dependency_name("../evil").is_err());
        assert!(validate_dependency_name("-bad").is_err());
        assert!(validate_dependency_name("@scope").is_err());
        assert!(validate_dependency_name("@scope/").is_err());
        assert!(validate_dependency_name("a/b").is_err());
        assert!(validate_dependency_name("a b").is_err());

        assert!(validate_dependency_spec("latest").is_ok());
        assert!(validate_dependency_spec("^5.1.0").is_ok());
        assert!(validate_dependency_spec(">=1 <2").is_err());
        assert!(validate_dependency_spec("1.2.3; rm -rf /").is_err());
        assert!(validate_dependency_spec("-1").is_err());
    }

    #[test]
    fn bun_install_uses_ignore_scripts() {
        let Ok(bun) = resolve_bun() else {
            return;
        };
        let workspace = temp_workspace("install");
        let vendor = workspace.join("vendor/hello");
        std::fs::create_dir_all(&vendor).unwrap();
        std::fs::write(
            vendor.join("package.json"),
            serde_json::json!({
                "name": "hello",
                "version": "1.0.0",
                "type": "module",
                "main": "index.js",
                "scripts": {
                    "postinstall": "node -e \"require('fs').writeFileSync('postinstall-ran','x')\""
                }
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(vendor.join("index.js"), "export const hello = 'hi';\n").unwrap();
        std::fs::write(
            workspace.join("package.json"),
            serde_json::json!({
                "name": "wordma-mdx-test",
                "private": true,
                "dependencies": { "hello": "file:./vendor/hello" }
            })
            .to_string(),
        )
        .unwrap();

        let output = run_bun_install(&bun, &workspace).unwrap();
        assert!(
            workspace.join("node_modules/hello/package.json").is_file(),
            "{output}"
        );
        assert!(!workspace.join("postinstall-ran").exists());
        assert!(!vendor.join("postinstall-ran").exists());
        let report = deps_report(&workspace, String::new()).unwrap();
        let hello = report
            .dependencies
            .iter()
            .find(|dependency| dependency.name == "hello")
            .unwrap();
        assert_eq!(hello.version.as_deref(), Some("1.0.0"));

        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn deps_report_reads_package_and_installed_versions() {
        let workspace = temp_workspace("deps");
        std::fs::write(
            workspace.join("package.json"),
            serde_json::json!({
                "name": "test",
                "private": true,
                "dependencies": { "nanoid": "^5.1.0", "@scope/pkg": "latest" }
            })
            .to_string(),
        )
        .unwrap();
        let report = deps_report(&workspace, "installed".to_string()).unwrap();
        assert_eq!(report.dependencies.len(), 2);
        assert!(!report.installed);
        assert_eq!(report.output, "installed");
        assert!(report
            .dependencies
            .iter()
            .all(|dependency| dependency.version.is_none()));

        std::fs::create_dir_all(workspace.join("node_modules/nanoid")).unwrap();
        std::fs::write(
            workspace.join("node_modules/nanoid/package.json"),
            serde_json::json!({ "version": "5.1.0" }).to_string(),
        )
        .unwrap();
        let report = deps_report(&workspace, String::new()).unwrap();
        assert!(report.installed);
        let nanoid = report
            .dependencies
            .iter()
            .find(|dependency| dependency.name == "nanoid")
            .unwrap();
        assert_eq!(nanoid.version.as_deref(), Some("5.1.0"));
        assert!(installed_version(&workspace, "../package").is_none());

        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn write_preview_files_creates_entry_css_html() {
        let dir = temp_workspace("preview");
        write_preview_files(&dir, "abc123", "export function mount() {}", Some("body{}"))
            .unwrap();
        assert!(dir.join("__mdx-preview/abc123/entry.js").is_file());
        assert!(dir.join("__mdx-preview/abc123/entry.css").is_file());
        assert!(dir.join("__mdx-preview/abc123/index.html").is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
