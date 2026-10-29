use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::engine::LineBuffer;

#[derive(Default, Clone)]
pub struct DependencyManager {
    running: Arc<AtomicBool>,
}

struct RunningGuard(Arc<AtomicBool>);

impl Drop for RunningGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepsError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl DepsError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyItem {
    pub name: String,
    pub version: String,
    pub group: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_version: Option<String>,
    pub lifecycle_scripts: Vec<String>,
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyState {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_json: Option<String>,
    pub dependencies: Vec<DependencyItem>,
    pub trusted_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyOperationResult {
    pub operation_id: String,
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub restarted_engine: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restart_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyLogEvent {
    operation_id: String,
    stream: &'static str,
    line: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DependencyAction {
    Add,
    Remove,
    Update,
}

impl DependencyAction {
    fn parse(value: &str) -> Result<Self, DepsError> {
        match value {
            "add" => Ok(Self::Add),
            "remove" => Ok(Self::Remove),
            "update" => Ok(Self::Update),
            _ => Err(DepsError::new(
                "INVALID_ACTION",
                format!("未知依赖操作：{value}"),
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Add => "add",
            Self::Remove => "remove",
            Self::Update => "update",
        }
    }
}

fn canonical_root(root: &str) -> Result<PathBuf, DepsError> {
    let canonical = dunce::canonicalize(root).map_err(|_| {
        DepsError::new(
            "INVALID_ROOT",
            format!("工作区不存在或无法访问：{root}"),
        )
    })?;

    if !canonical.is_dir() {
        return Err(DepsError::new(
            "INVALID_ROOT",
            format!("工作区不是目录：{}", canonical.display()),
        ));
    }

    Ok(canonical)
}

fn valid_name_segment(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    (first.is_ascii_lowercase() || first.is_ascii_digit())
        && chars.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '_' | '-')
        })
}

fn valid_package_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 214 {
        return false;
    }

    if let Some(rest) = name.strip_prefix('@') {
        let Some((scope, package)) = rest.split_once('/') else {
            return false;
        };
        return !scope.is_empty()
            && !package.is_empty()
            && !package.contains('/')
            && valid_name_segment(scope)
            && valid_name_segment(package);
    }

    !name.contains('/') && valid_name_segment(name)
}

fn valid_version(version: &str) -> bool {
    !version.is_empty()
        && version.len() <= 100
        && version.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(
                    character,
                    '.' | '*'
                        | '^'
                        | '~'
                        | '<'
                        | '>'
                        | '='
                        | '+'
                        | '|'
                        | '_'
                        | '-'
                )
        })
}

fn split_package_spec(
    spec: &str,
) -> Result<(String, Option<String>), DepsError> {
    let spec = spec.trim();

    if spec.is_empty()
        || spec.starts_with('-')
        || spec.len() > 214
        || spec.chars().any(char::is_whitespace)
        || spec.chars().any(char::is_control)
    {
        return Err(DepsError::new(
            "INVALID_PACKAGE_SPEC",
            format!("无效的依赖参数：{spec}"),
        ));
    }

    let version_start = if spec.starts_with('@') {
        spec.rfind('@').filter(|index| *index > 0)
    } else {
        spec.find('@').filter(|index| *index > 0)
    };

    let (name, version) = match version_start {
        Some(index) => (
            spec[..index].to_string(),
            Some(spec[index + 1..].to_string()),
        ),
        None => (spec.to_string(), None),
    };

    if !valid_package_name(&name) {
        return Err(DepsError::new(
            "INVALID_PACKAGE_NAME",
            format!("无效的包名：{name}"),
        ));
    }

    if let Some(version) = &version {
        if !valid_version(version) {
            return Err(DepsError::new(
                "INVALID_PACKAGE_VERSION",
                format!("无效的版本范围：{version}"),
            ));
        }
    }

    Ok((name, version))
}

fn validate_packages(
    action: DependencyAction,
    packages: &[String],
) -> Result<Vec<(String, Option<String>)>, DepsError> {
    if packages.len() > 20 {
        return Err(DepsError::new(
            "TOO_MANY_PACKAGES",
            "一次最多操作 20 个依赖",
        ));
    }

    if matches!(action, DependencyAction::Add | DependencyAction::Remove)
        && packages.is_empty()
    {
        return Err(DepsError::new(
            "MISSING_PACKAGE",
            "请至少提供一个包名",
        ));
    }

    packages
        .iter()
        .map(|spec| split_package_spec(spec))
        .collect()
}

fn dependency_names(
    packages: &[(String, Option<String>)],
) -> Vec<String> {
    packages
        .iter()
        .map(|(name, _)| name.clone())
        .collect()
}

fn assert_trusted_scripts(
    packages: &[(String, Option<String>)],
    trusted: &BTreeSet<String>,
) -> Result<(), DepsError> {
    let untrusted: Vec<String> = dependency_names(packages)
        .into_iter()
        .filter(|name| !trusted.contains(name))
        .collect();

    if untrusted.is_empty() {
        Ok(())
    } else {
        Err(DepsError::new(
            "UNTRUSTED_SCRIPTS",
            format!(
                "以下依赖未加入 trustedDependencies：{}",
                untrusted.join(", ")
            ),
        ))
    }
}

fn build_bun_args(
    action: DependencyAction,
    packages: &[String],
    dev: bool,
    ignore_scripts: bool,
) -> Vec<String> {
    let mut args = vec![action.as_str().to_string()];
    args.extend(packages.iter().cloned());
    args.push("--no-progress".to_string());

    if action == DependencyAction::Add && dev {
        args.push("--dev".to_string());
    }

    if ignore_scripts {
        args.push("--ignore-scripts".to_string());
    }

    args
}

fn read_json(path: &Path) -> Result<Value, DepsError> {
    let source = std::fs::read_to_string(path).map_err(|error| {
        DepsError {
            code: "READ_PACKAGE_JSON_FAILED".to_string(),
            message: format!("读取 package.json 失败：{error}"),
            path: Some(path.to_string_lossy().into_owned()),
        }
    })?;

    serde_json::from_str(&source).map_err(|error| DepsError {
        code: "INVALID_PACKAGE_JSON".to_string(),
        message: format!("package.json 不是合法 JSON：{error}"),
        path: Some(path.to_string_lossy().into_owned()),
    })
}

fn trusted_dependencies(package: &Value) -> BTreeSet<String> {
    let mut trusted = BTreeSet::new();

    match package.get("trustedDependencies") {
        Some(Value::Array(items)) => {
            for item in items {
                if let Some(name) = item.as_str() {
                    trusted.insert(name.to_string());
                }
            }
        }
        Some(Value::Object(items)) => {
            for key in items.keys() {
                trusted.insert(key.clone());
            }
        }
        _ => {}
    }

    trusted
}

fn installed_package(
    root: &Path,
    name: &str,
) -> (
    bool,
    Option<String>,
    Vec<String>,
) {
    if !valid_package_name(name) {
        return (false, None, Vec::new());
    }

    let mut path = root.join("node_modules");
    for segment in name.split('/') {
        path.push(segment);
    }
    path.push("package.json");

    if !path.is_file() {
        return (false, None, Vec::new());
    }

    let Ok(value) = read_json(&path) else {
        return (true, None, Vec::new());
    };

    let version = value
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut lifecycle = Vec::new();

    if let Some(scripts) =
        value.get("scripts").and_then(Value::as_object)
    {
        for key in [
            "preinstall",
            "install",
            "postinstall",
            "prepare",
        ] {
            if scripts.contains_key(key) {
                lifecycle.push(key.to_string());
            }
        }
    }

    (true, version, lifecycle)
}

pub fn read_dependency_state(
    root_input: &str,
) -> Result<DependencyState, DepsError> {
    let root = canonical_root(root_input)?;
    let package_path = root.join("package.json");

    if !package_path.is_file() {
        return Ok(DependencyState {
            exists: false,
            package_json: Some(
                package_path.to_string_lossy().into_owned(),
            ),
            dependencies: Vec::new(),
            trusted_dependencies: Vec::new(),
        });
    }

    let package = read_json(&package_path)?;
    if !package.is_object() {
        return Err(DepsError {
            code: "INVALID_PACKAGE_JSON".to_string(),
            message: "package.json 根节点必须是对象".to_string(),
            path: Some(
                package_path.to_string_lossy().into_owned(),
            ),
        });
    }

    let trusted = trusted_dependencies(&package);
    let mut dependencies = Vec::new();

    for group in [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
    ] {
        let Some(value) = package.get(group) else {
            continue;
        };
        let Some(entries) = value.as_object() else {
            return Err(DepsError {
                code: "INVALID_PACKAGE_JSON".to_string(),
                message: format!("{group} 必须是对象"),
                path: Some(
                    package_path.to_string_lossy().into_owned(),
                ),
            });
        };

        let mut sorted = BTreeMap::new();
        for (name, version) in entries {
            sorted.insert(name.clone(), version.clone());
        }

        for (name, version) in sorted {
            let version = version
                .as_str()
                .map(str::to_string)
                .unwrap_or_default();
            let is_trusted = trusted.contains(&name);
            let (installed, installed_version, lifecycle) =
                installed_package(&root, &name);

            dependencies.push(DependencyItem {
                name,
                version,
                group: group.to_string(),
                installed,
                installed_version,
                lifecycle_scripts: lifecycle,
                trusted: is_trusted,
            });
        }
    }

    Ok(DependencyState {
        exists: true,
        package_json: Some(
            package_path.to_string_lossy().into_owned(),
        ),
        dependencies,
        trusted_dependencies: trusted.into_iter().collect(),
    })
}

fn emit_log(
    app: &AppHandle,
    operation_id: &str,
    stream: &'static str,
    line: &str,
) {
    let _ = app.emit(
        "deps://log",
        DependencyLogEvent {
            operation_id: operation_id.to_string(),
            stream,
            line: line.to_string(),
        },
    );
}

fn operation_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("deps-{}-{nanos}", std::process::id())
}

#[tauri::command]
pub fn deps_list(
    root: String,
) -> Result<DependencyState, DepsError> {
    read_dependency_state(&root)
}

#[tauri::command]
pub async fn deps_install(
    app: AppHandle,
    manager: State<'_, DependencyManager>,
    root: String,
    action: String,
    packages: Vec<String>,
    dev: Option<bool>,
    allow_trusted_scripts: Option<bool>,
) -> Result<DependencyOperationResult, DepsError> {
    if manager
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(DepsError::new(
            "BUSY",
            "已有依赖操作正在进行",
        ));
    }
    let _guard = RunningGuard(manager.running.clone());

    let root = canonical_root(&root)?;
    let action = DependencyAction::parse(&action)?;
    let parsed = validate_packages(action, &packages)?;
    let dev = dev.unwrap_or(false) && action == DependencyAction::Add;
    let allow_scripts = allow_trusted_scripts.unwrap_or(false);

    if allow_scripts {
        if action == DependencyAction::Remove {
            return Err(DepsError::new(
                "INVALID_SCRIPTS_OPTION",
                "移除依赖不会运行安装脚本",
            ));
        }
        if parsed.is_empty() {
            return Err(DepsError::new(
                "INVALID_SCRIPTS_OPTION",
                "运行可信脚本时必须明确指定包名",
            ));
        }

        let state = read_dependency_state(&root.to_string_lossy())?;
        let trusted: BTreeSet<String> =
            state.trusted_dependencies.into_iter().collect();
        assert_trusted_scripts(&parsed, &trusted)?;
    }

    let args = build_bun_args(
        action,
        &packages,
        dev,
        !allow_scripts,
    );
    let operation_id = operation_id();

    let command = app
        .shell()
        .sidecar("bun")
        .map_err(|error| {
            DepsError::new(
                "BUN_NOT_FOUND",
                format!(
                    "Bun sidecar 不可用（请检查平台、签名或重新安装）：{error}"
                ),
            )
        })?
        .args(args)
        .current_dir(&root)
        .set_raw_out(true)
        .set_process_group(true);

    let (mut receiver, _child) = command.spawn().map_err(|error| {
        DepsError::new(
            "BUN_SPAWN_FAILED",
            format!("启动 bun 失败：{error}"),
        )
    })?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut stdout_lines = LineBuffer::default();
    let mut stderr_lines = LineBuffer::default();
    let mut code = None;

    while let Some(event) = receiver.recv().await {
        match event {
            CommandEvent::Stdout(chunk) => {
                for line in stdout_lines.push(&chunk) {
                    emit_log(&app, &operation_id, "stdout", &line);
                    stdout.push_str(&line);
                    stdout.push('\n');
                }
            }
            CommandEvent::Stderr(chunk) => {
                for line in stderr_lines.push(&chunk) {
                    emit_log(&app, &operation_id, "stderr", &line);
                    stderr.push_str(&line);
                    stderr.push('\n');
                }
            }
            CommandEvent::Error(message) => {
                emit_log(&app, &operation_id, "stderr", &message);
                stderr.push_str(&message);
                stderr.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                code = payload.code;
                if let Some(line) = stdout_lines.flush() {
                    emit_log(&app, &operation_id, "stdout", &line);
                    stdout.push_str(&line);
                    stdout.push('\n');
                }
                if let Some(line) = stderr_lines.flush() {
                    emit_log(&app, &operation_id, "stderr", &line);
                    stderr.push_str(&line);
                    stderr.push('\n');
                }
                break;
            }
            _ => {}
        }
    }

    let success = code == Some(0);
    let mut restarted_engine = false;
    let mut restart_error = None;

    if success {
        match crate::engine::restart_dev_if_running(&app) {
            Ok(restarted) => restarted_engine = restarted,
            Err(error) => restart_error = Some(error),
        }
    }

    Ok(DependencyOperationResult {
        operation_id,
        success,
        code,
        stdout,
        stderr,
        restarted_engine,
        restart_error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_workspace() -> tempfile::TempDir {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("node_modules/demo"))
            .expect("node_modules");
        root
    }

    #[test]
    fn validates_package_specs() {
        assert_eq!(
            split_package_spec("react@^19.0.0").expect("react"),
            ("react".to_string(), Some("^19.0.0".to_string()))
        );
        assert_eq!(
            split_package_spec("@scope/pkg@~1.2").expect("scope"),
            (
                "@scope/pkg".to_string(),
                Some("~1.2".to_string())
            )
        );

        for invalid in [
            "",
            "--registry=https://evil",
            "file:../x",
            "https://example.com/x.tgz",
            "../escape",
            "BadName",
            "pkg@1.0/2",
            "pkg@^1.0 2.0",
        ] {
            assert!(
                split_package_spec(invalid).is_err(),
                "{invalid} 应被拒绝"
            );
        }
    }

    #[test]
    fn builds_safe_bun_args() {
        let args = build_bun_args(
            DependencyAction::Add,
            &["react@^19".to_string()],
            true,
            true,
        );

        assert_eq!(
            args,
            vec![
                "add",
                "react@^19",
                "--no-progress",
                "--dev",
                "--ignore-scripts",
            ]
        );
        assert!(!args.iter().any(|arg| arg == "sh"));
        assert!(!args.iter().any(|arg| arg.starts_with("-c")));
    }

    #[test]
    fn reads_installed_and_trusted_dependencies() {
        let root = make_workspace();
        fs::write(
            root.path().join("package.json"),
            r#"{
              "dependencies": { "demo": "^1.0.0", "missing": "2.0.0" },
              "devDependencies": { "other": "3.0.0" },
              "trustedDependencies": ["demo"]
            }"#,
        )
        .expect("package");
        fs::write(
            root.path().join("node_modules/demo/package.json"),
            r#"{
              "name": "demo",
              "version": "1.2.3",
              "scripts": { "postinstall": "node setup.js", "test": "x" }
            }"#,
        )
        .expect("installed");

        let state =
            read_dependency_state(&root.path().to_string_lossy())
                .expect("state");
        let demo = state
            .dependencies
            .iter()
            .find(|item| item.name == "demo")
            .expect("demo");
        let missing = state
            .dependencies
            .iter()
            .find(|item| item.name == "missing")
            .expect("missing");

        assert!(state.exists);
        assert_eq!(demo.group, "dependencies");
        assert!(demo.installed);
        assert_eq!(demo.installed_version.as_deref(), Some("1.2.3"));
        assert_eq!(demo.lifecycle_scripts, vec!["postinstall"]);
        assert!(demo.trusted);
        assert!(!missing.installed);
        assert_eq!(state.trusted_dependencies, vec!["demo"]);
    }

    #[test]
    fn missing_package_json_is_empty_state() {
        let root = tempfile::tempdir().expect("tempdir");
        let state =
            read_dependency_state(&root.path().to_string_lossy())
                .expect("state");

        assert!(!state.exists);
        assert!(state.dependencies.is_empty());
    }

    #[test]
    fn rejects_invalid_dependency_lists() {
        let root = tempfile::tempdir().expect("tempdir");
        fs::write(
            root.path().join("package.json"),
            r#"{ "dependencies": [] }"#,
        )
        .expect("package");

        let error =
            read_dependency_state(&root.path().to_string_lossy())
                .expect_err("invalid");
        assert_eq!(error.code, "INVALID_PACKAGE_JSON");
    }

    #[test]
    fn requires_trusted_dependencies_for_scripts() {
        let trusted =
            BTreeSet::from(["demo".to_string()]);
        let allowed = vec![(
            "demo".to_string(),
            Some("1.0.0".to_string()),
        )];
        let rejected = vec![
            ("demo".to_string(), None),
            ("react".to_string(), Some("19".to_string())),
        ];

        assert!(assert_trusted_scripts(&allowed, &trusted).is_ok());

        let error = assert_trusted_scripts(&rejected, &trusted)
            .expect_err("untrusted");
        assert_eq!(error.code, "UNTRUSTED_SCRIPTS");
        assert!(error.message.contains("react"));
    }
}
