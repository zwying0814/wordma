use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
pub struct EngineManager {
    inner: Mutex<EngineInner>,
}

#[derive(Default)]
struct EngineInner {
    child: Option<CommandChild>,
    generation: u64,
    root: Option<String>,
    port: Option<u16>,
    url: Option<String>,
    stopping_generation: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStart {
    pub url: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineBuildResult {
    pub code: Option<i32>,
    pub event: Option<Value>,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatePayload {
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<i32>,
}

#[derive(Default)]
pub struct LineBuffer {
    buffer: Vec<u8>,
}

impl LineBuffer {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut lines = Vec::new();

        while let Some(index) = self
            .buffer
            .iter()
            .position(|byte| *byte == b'\n')
        {
            let mut line = self
                .buffer
                .drain(..=index)
                .collect::<Vec<u8>>();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            lines.push(String::from_utf8_lossy(&line).into_owned());
        }

        lines
    }

    pub fn flush(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }

        let mut bytes = std::mem::take(&mut self.buffer);
        if bytes.last() == Some(&b'\r') {
            bytes.pop();
        }

        Some(String::from_utf8_lossy(&bytes).into_owned())
    }
}

struct RunOutcome {
    code: Option<i32>,
    events: Vec<Value>,
    stdout: Vec<u8>,
    stderr: String,
}

fn emit_state(
    app: &AppHandle,
    state: &'static str,
    code: Option<i32>,
) {
    let _ = app.emit(
        "engine://state",
        EngineStatePayload { state, code },
    );
}

fn emit_log(app: &AppHandle, stream: &str, line: &str) {
    let _ = app.emit(
        "engine://log",
        serde_json::json!({
            "stream": stream,
            "line": line,
        }),
    );
}

fn resource_engine_dir(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let directory = resource_dir.join("engine");

    if directory.join("cli.js").is_file()
        || directory.join("cli.ts").is_file()
    {
        Some(
            dunce::canonicalize(&directory)
                .unwrap_or(directory),
        )
    } else {
        None
    }
}

fn engine_entry(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(entry) = std::env::var("WORDMA_ENGINE_ENTRY") {
        candidates.push(PathBuf::from(entry));
    }

    #[cfg(debug_assertions)]
    {
        let repo_root =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        candidates.push(repo_root.join("packages/engine/src/cli.ts"));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("engine/cli.js"));
        candidates.push(resource_dir.join("engine/cli.ts"));
    }

    for candidate in candidates {
        if candidate.is_file() {
            return dunce::canonicalize(&candidate)
                .map_err(|error| {
                    format!(
                        "无法解析 engine 入口 {}：{error}",
                        candidate.display()
                    )
                });
        }
    }

    Err(
        "未找到 engine 入口；请确认安装包包含 Resources/engine，\
         开发环境请确认 packages/engine 存在，或设置 WORDMA_ENGINE_ENTRY"
            .to_string(),
    )
}

fn canonical_root(root: &str) -> Result<String, String> {
    let canonical = dunce::canonicalize(root)
        .map_err(|_| format!("工作区不存在或无法访问：{root}"))?;

    if !canonical.is_dir() {
        return Err(format!(
            "工作区不是目录：{}",
            canonical.display()
        ));
    }

    Ok(canonical.to_string_lossy().into_owned())
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("无法分配预览端口：{error}"))?;

    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("无法读取预览端口：{error}"))
}

fn engine_command(
    app: &AppHandle,
    entry: &Path,
    args: Vec<String>,
) -> Result<tauri_plugin_shell::process::Command, String> {
    let mut all = vec![entry.to_string_lossy().into_owned()];
    all.extend(args);

    let command = app
        .shell()
        .sidecar("bun")
        .map_err(|error| format!("无法启动 Bun sidecar：{error}"))?
        .args(all)
        .set_raw_out(true)
        .set_process_group(true);

    let Some(resource_engine) = resource_engine_dir(app) else {
        return Ok(command);
    };
    let canonical_entry =
        dunce::canonicalize(entry).unwrap_or_else(|_| entry.to_path_buf());

    if !canonical_entry.starts_with(&resource_engine) {
        return Ok(command);
    }

    Ok(command
        .env("WORDMA_ENGINE_ROOT", &resource_engine)
        .env(
            "WORDMA_DEFAULT_THEME_DIR",
            resource_engine.join("themes/default"),
        )
        .env(
            "WORDMA_ISLAND_RUNTIME_ENTRY",
            resource_engine.join("runtime-entry.ts"),
        ))
}

async fn run_engine(
    app: &AppHandle,
    args: Vec<String>,
    forward_events: bool,
) -> Result<RunOutcome, String> {
    let entry = engine_entry(app)?;
    let command = engine_command(app, &entry, args)?;
    let (mut receiver, _child) = command
        .spawn()
        .map_err(|error| format!("启动 engine 失败：{error}"))?;

    let mut lines = LineBuffer::default();
    let mut stdout = Vec::new();
    let mut stderr = String::new();
    let mut events = Vec::new();
    let mut code = None;

    while let Some(event) = receiver.recv().await {
        match event {
            CommandEvent::Stdout(chunk) => {
                stdout.extend_from_slice(&chunk);

                for line in lines.push(&chunk) {
                    if line.trim().is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<Value>(&line) {
                        Ok(value) => {
                            if value.get("type").and_then(Value::as_str)
                                == Some("build-success")
                                || value
                                    .get("type")
                                    .and_then(Value::as_str)
                                    == Some("build-error")
                            {
                                events.push(value.clone());
                            }
                            if forward_events {
                                let _ = app.emit("engine://event", value);
                            }
                        }
                        Err(_) => {
                            if forward_events {
                                emit_log(app, "stdout", &line);
                            }
                        }
                    }
                }
            }
            CommandEvent::Stderr(chunk) => {
                let line =
                    String::from_utf8_lossy(&chunk).into_owned();
                if !line.trim().is_empty() {
                    if !stderr.is_empty() {
                        stderr.push('\n');
                    }
                    stderr.push_str(line.trim_end());
                    emit_log(app, "stderr", line.trim_end());
                }
            }
            CommandEvent::Error(message) => {
                emit_log(app, "engine", &message);
            }
            CommandEvent::Terminated(payload) => {
                code = payload.code;
                if let Some(line) = lines.flush() {
                    if let Ok(value) =
                        serde_json::from_str::<Value>(&line)
                    {
                        if forward_events {
                            let _ =
                                app.emit("engine://event", value);
                        }
                    }
                }
                break;
            }
            _ => {}
        }
    }

    Ok(RunOutcome {
        code,
        events,
        stdout,
        stderr,
    })
}

fn engine_error_message(outcome: &RunOutcome) -> String {
    if let Some(diagnostics) = outcome
        .events
        .last()
        .and_then(|event| event.get("diagnostics"))
        .and_then(Value::as_array)
    {
        let messages = diagnostics
            .iter()
            .filter_map(|diagnostic| {
                diagnostic.get("message").and_then(Value::as_str)
            })
            .collect::<Vec<_>>();

        if !messages.is_empty() {
            return format!(
                "engine inspect 失败：{}",
                messages.join("；")
            );
        }
    }

    if outcome.stderr.is_empty() {
        "engine inspect 失败".to_string()
    } else {
        outcome.stderr.clone()
    }
}

fn update_dev_url(
    app: &AppHandle,
    generation: u64,
    url: &str,
) {
    if let Some(manager) = app.try_state::<EngineManager>() {
        if let Ok(mut inner) = manager.inner.lock() {
            if inner.generation == generation {
                inner.url = Some(url.to_string());
            }
        }
    }
}

fn stop_engine(manager: &EngineManager) {
    let child = {
        let mut inner = match manager.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        inner.stopping_generation = Some(inner.generation);
        inner.child.take()
    };

    if let Some(child) = child {
        let _ = child.kill();
    }
}

#[tauri::command]
pub fn engine_start_dev(
    app: AppHandle,
    manager: State<'_, EngineManager>,
    root: String,
    port: Option<u16>,
) -> Result<EngineStart, String> {
    start_dev_engine(&app, &manager, root, port)
}

fn start_dev_engine(
    app: &AppHandle,
    manager: &EngineManager,
    root: String,
    port: Option<u16>,
) -> Result<EngineStart, String> {
    let root = canonical_root(&root)?;
    let port = match port {
        Some(value) if value > 0 => value,
        _ => free_port()?,
    };

    stop_engine(manager);

    let entry = engine_entry(app)?;
    let args = vec![
        "dev".to_string(),
        "--root".to_string(),
        root.clone(),
        "--port".to_string(),
        port.to_string(),
        "--json".to_string(),
    ];
    let command = engine_command(app, &entry, args)?;
    let (mut receiver, child) = command
        .spawn()
        .map_err(|error| format!("启动 dev engine 失败：{error}"))?;

    let generation = {
        let mut inner = manager
            .inner
            .lock()
            .map_err(|_| "engine 状态锁失败".to_string())?;
        inner.generation = inner.generation.wrapping_add(1);
        inner.child = Some(child);
        inner.root = Some(root.clone());
        inner.port = Some(port);
        inner.url = None;
        inner.stopping_generation = None;
        inner.generation
    };

    emit_state(app, "starting", None);

    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = LineBuffer::default();
        let mut terminated = false;

        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(chunk) => {
                    for line in lines.push(&chunk) {
                        if line.trim().is_empty() {
                            continue;
                        }

                        match serde_json::from_str::<Value>(&line) {
                            Ok(value) => {
                                if value
                                    .get("type")
                                    .and_then(Value::as_str)
                                    == Some("ready")
                                {
                                    if let Some(url) = value
                                        .get("url")
                                        .and_then(Value::as_str)
                                    {
                                        update_dev_url(
                                            &task_app,
                                            generation,
                                            url,
                                        );
                                    }
                                }

                                let _ = task_app
                                    .emit("engine://event", value);
                            }
                            Err(_) => emit_log(
                                &task_app,
                                "stdout",
                                &line,
                            ),
                        }
                    }
                }
                CommandEvent::Stderr(chunk) => {
                    let line =
                        String::from_utf8_lossy(&chunk).into_owned();
                    if !line.trim().is_empty() {
                        emit_log(
                            &task_app,
                            "stderr",
                            line.trim_end(),
                        );
                    }
                }
                CommandEvent::Error(message) => {
                    emit_log(&task_app, "engine", &message);
                }
                CommandEvent::Terminated(payload) => {
                    terminated = true;
                    if let Some(line) = lines.flush() {
                        if let Ok(value) =
                            serde_json::from_str::<Value>(&line)
                        {
                            let _ = task_app
                                .emit("engine://event", value);
                        }
                    }

                    let intentional = {
                        let manager = task_app
                            .state::<EngineManager>();
                        let mut inner =
                            match manager.inner.lock() {
                                Ok(inner) => inner,
                                Err(_) => break,
                            };

                        if inner.generation != generation {
                            break;
                        }

                        inner.child = None;
                        let intentional =
                            inner.stopping_generation == Some(generation);
                        inner.stopping_generation = None;
                        intentional
                    };

                    let state = if intentional {
                        "stopped"
                    } else {
                        "crashed"
                    };
                    emit_state(
                        &task_app,
                        state,
                        payload.code,
                    );
                    let _ = task_app.emit(
                        "engine://event",
                        serde_json::json!({
                            "v": 1,
                            "type": "exit",
                            "code": payload.code,
                            "reason": state,
                        }),
                    );
                    break;
                }
                _ => {}
            }
        }

        if !terminated {
            emit_state(&task_app, "stopped", None);
        }
    });

    emit_state(app, "running", None);

    Ok(EngineStart {
        url: format!("http://127.0.0.1:{port}/"),
        port,
    })
}

pub fn restart_dev_if_running(
    app: &AppHandle,
) -> Result<bool, String> {
    let Some(manager) = app.try_state::<EngineManager>() else {
        return Ok(false);
    };

    let (root, port, running) = {
        let inner = manager
            .inner
            .lock()
            .map_err(|_| "engine 状态锁失败".to_string())?;
        (inner.root.clone(), inner.port, inner.child.is_some())
    };

    if !running {
        return Ok(false);
    }

    let Some(root) = root else {
        return Ok(false);
    };

    start_dev_engine(app, &manager, root, port)?;
    Ok(true)
}

/// 复用同一工作区的 dev 进程；工作区变化时启动新的 dev。
/// 返回 canonical root，供 preview 等待 ready URL。
pub fn ensure_dev(
    app: &AppHandle,
    root: String,
) -> Result<String, String> {
    let root = canonical_root(&root)?;
    let manager = app.state::<EngineManager>();
    let running_same = {
        let inner = manager
            .inner
            .lock()
            .map_err(|_| "engine 状态锁失败".to_string())?;
        inner.child.is_some()
            && inner.root.as_deref() == Some(root.as_str())
    };

    if !running_same {
        start_dev_engine(app, &manager, root.clone(), None)?;
    }

    Ok(root)
}

pub fn dev_url_for_root(
    app: &AppHandle,
    root: &str,
) -> Option<String> {
    let manager = app.try_state::<EngineManager>()?;
    let inner = manager.inner.lock().ok()?;

    if inner.child.is_some()
        && inner.root.as_deref() == Some(root)
    {
        inner.url.clone()
    } else {
        None
    }
}

pub fn stop(app: &AppHandle) {
    if let Some(manager) = app.try_state::<EngineManager>() {
        stop_engine(&manager);
    }
}

#[tauri::command]
pub fn engine_stop(
    manager: State<'_, EngineManager>,
) -> Result<(), String> {
    stop_engine(&manager);
    Ok(())
}

fn validate_publish_out_dir(
    out_dir: &str,
) -> Result<(), String> {
    let path = PathBuf::from(out_dir);

    if !path.is_absolute() {
        return Err("发布目录必须是绝对路径".to_string());
    }

    if path.exists() {
        if !path.is_dir() {
            return Err(format!(
                "发布目录不是文件夹：{}",
                path.display()
            ));
        }

        let non_empty = std::fs::read_dir(&path)
            .map_err(|error| {
                format!(
                    "无法读取发布目录 {}：{error}",
                    path.display()
                )
            })?
            .next()
            .is_some();

        if non_empty
            && !path.join(".wordma-manifest.json").is_file()
        {
            return Err(format!(
                "发布目录非空且不是 Wordma 产物：{}",
                path.display()
            ));
        }
    } else {
        let parent = path.parent().ok_or_else(|| {
            "发布目录缺少父目录".to_string()
        })?;
        if !parent.is_dir() {
            return Err(format!(
                "发布目录的父目录不存在：{}",
                parent.display()
            ));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn engine_build(
    app: AppHandle,
    root: String,
    out_dir: Option<String>,
) -> Result<EngineBuildResult, String> {
    let root = canonical_root(&root)?;
    let mut args = vec![
        "build".to_string(),
        "--root".to_string(),
        root,
        "--json".to_string(),
    ];

    if let Some(out_dir) = out_dir {
        validate_publish_out_dir(&out_dir)?;
        args.push("--out".to_string());
        args.push(out_dir);
    }

    let outcome = run_engine(&app, args, true).await?;
    let event = outcome.events.last().cloned();

    Ok(EngineBuildResult {
        code: outcome.code,
        event,
        stderr: outcome.stderr,
    })
}

#[tauri::command]
pub async fn engine_inspect(
    app: AppHandle,
    root: String,
) -> Result<Value, String> {
    let root = canonical_root(&root)?;
    let outcome = run_engine(
        &app,
        vec![
            "inspect".to_string(),
            "--root".to_string(),
            root,
            "--json".to_string(),
        ],
        false,
    )
    .await?;

    if outcome.code != Some(0) {
        return Err(engine_error_message(&outcome));
    }

    serde_json::from_slice::<Value>(&outcome.stdout)
        .map_err(|error| format!("解析 inspect JSON 失败：{error}"))
}

#[tauri::command]
pub async fn theme_list(
    app: AppHandle,
    root: String,
) -> Result<Value, String> {
    let root = canonical_root(&root)?;
    let outcome = run_engine(
        &app,
        vec![
            "theme".to_string(),
            "list".to_string(),
            "--root".to_string(),
            root,
            "--json".to_string(),
        ],
        false,
    )
    .await?;

    if outcome.code != Some(0) {
        return Err(engine_error_message(&outcome));
    }

    serde_json::from_slice::<Value>(&outcome.stdout)
        .map_err(|error| format!("解析主题列表失败：{error}"))
}

#[tauri::command]
pub async fn theme_apply(
    app: AppHandle,
    root: String,
    theme_id: String,
    reset_settings: Option<bool>,
) -> Result<Value, String> {
    let root = canonical_root(&root)?;
    let mut args = vec![
        "config".to_string(),
        "set-theme".to_string(),
        "--root".to_string(),
        root,
        "--theme".to_string(),
        theme_id,
        "--json".to_string(),
    ];

    if reset_settings.unwrap_or(false) {
        args.push("--reset-settings".to_string());
    }

    let outcome = run_engine(&app, args, false).await?;

    if outcome.code != Some(0) {
        return Err(engine_error_message(&outcome));
    }

    serde_json::from_slice::<Value>(&outcome.stdout)
        .map_err(|error| format!("解析主题切换结果失败：{error}"))
}

#[tauri::command]
pub async fn theme_settings_apply(
    app: AppHandle,
    root: String,
    values: Value,
) -> Result<Value, String> {
    if !values.is_object() {
        return Err("主题设置必须是对象".to_string());
    }

    let root = canonical_root(&root)?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let values_path = std::env::temp_dir().join(format!(
        "wordma-settings-{}-{nanos}.json",
        std::process::id()
    ));
    let serialized = serde_json::to_vec_pretty(&values)
        .map_err(|error| format!("序列化主题设置失败：{error}"))?;

    std::fs::write(&values_path, serialized)
        .map_err(|error| format!("写入临时设置文件失败：{error}"))?;

    let outcome = run_engine(
        &app,
        vec![
            "config".to_string(),
            "set-settings".to_string(),
            "--root".to_string(),
            root,
            "--values".to_string(),
            values_path.to_string_lossy().into_owned(),
            "--json".to_string(),
        ],
        false,
    )
    .await;

    let _ = std::fs::remove_file(&values_path);

    let outcome = outcome?;

    if outcome.code != Some(0) {
        return Err(engine_error_message(&outcome));
    }

    serde_json::from_slice::<Value>(&outcome.stdout)
        .map_err(|error| format!("解析设置保存结果失败：{error}"))
}

pub fn shutdown(app: &AppHandle) {
    if let Some(manager) = app.try_state::<EngineManager>() {
        stop_engine(&manager);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_buffer_reassembles_split_json() {
        let mut buffer = LineBuffer::default();

        assert!(buffer.push(b"{\"type\":\"rea").is_empty());
        let lines = buffer.push(b"dy\"}\n{\"type\":\"build-s");
        assert_eq!(lines, vec!["{\"type\":\"ready\"}"]);

        let lines = buffer.push(b"uccess\"}\r\n");
        assert_eq!(
            lines,
            vec!["{\"type\":\"build-success\"}"]
        );
        assert_eq!(buffer.flush(), None);
    }

    #[test]
    fn line_buffer_flushes_trailing_line() {
        let mut buffer = LineBuffer::default();

        assert!(buffer.push(b"{\"type\":\"exit\"}").is_empty());
        assert_eq!(
            buffer.flush(),
            Some("{\"type\":\"exit\"}".to_string())
        );
    }

    #[test]
    fn free_port_returns_available_port() {
        let port = free_port().expect("port");
        assert!(port > 0);
    }

    #[test]
    fn canonical_root_rejects_missing_path() {
        let result = canonical_root(
            "/definitely/not/a/wordma/workspace",
        );
        assert!(result.is_err());
    }

    #[test]
    fn engine_error_message_uses_build_diagnostics() {
        let outcome = RunOutcome {
            code: Some(1),
            events: vec![serde_json::json!({
                "type": "build-error",
                "diagnostics": [
                    { "message": "缺少 frontmatter" },
                    { "message": "标题为空" }
                ]
            })],
            stdout: Vec::new(),
            stderr: String::new(),
        };

        assert_eq!(
            engine_error_message(&outcome),
            "engine inspect 失败：缺少 frontmatter；标题为空"
        );
    }

    #[test]
    fn engine_error_message_falls_back_to_stderr() {
        let outcome = RunOutcome {
            code: Some(1),
            events: Vec::new(),
            stdout: Vec::new(),
            stderr: "boom".to_string(),
        };

        assert_eq!(engine_error_message(&outcome), "boom");
    }

    #[test]
    fn publish_out_dir_requires_empty_or_manifest() {
        let root = tempfile::tempdir().expect("tempdir");
        let out = root.path().join("dist");
        std::fs::create_dir(&out).expect("out");

        assert!(validate_publish_out_dir(
            out.to_string_lossy().as_ref()
        )
        .is_ok());

        std::fs::write(out.join("keep.txt"), "keep")
            .expect("keep");
        let error = validate_publish_out_dir(
            out.to_string_lossy().as_ref(),
        )
        .expect_err("non-empty");
        assert!(error.contains("非空"));

        std::fs::write(
            out.join(".wordma-manifest.json"),
            "{}",
        )
        .expect("manifest");
        assert!(validate_publish_out_dir(
            out.to_string_lossy().as_ref()
        )
        .is_ok());

        let file = root.path().join("file.txt");
        std::fs::write(&file, "x").expect("file");
        assert!(validate_publish_out_dir(
            file.to_string_lossy().as_ref()
        )
        .is_err());

        assert!(validate_publish_out_dir("relative/dist").is_err());
    }
}
