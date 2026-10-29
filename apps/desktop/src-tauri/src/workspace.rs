use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const STATE_VERSION: u32 = 1;
const MAX_RECENT: usize = 12;
const STATE_FILE: &str = "workspaces.json";
const BACKUP_FILE: &str = "workspaces.json.bak";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspace {
    pub path: String,
    pub name: String,
    pub last_opened_at: u64,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub workspaces: Vec<RecentWorkspace>,
    pub auto_open_last: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStatus {
    pub path: String,
    pub name: String,
    pub has_site_config: bool,
    pub has_content_dir: bool,
}

const WELCOME_NOTE: &str = "---\ntitle: 欢迎使用 Wordma\n---\n\n# 欢迎使用 Wordma\n\n这是一个新的笔记空间。\n\n- 在左侧新建页面\n- 打开预览查看站点\n- 在属性面板调整主题与页面信息\n";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWorkspace {
    path: String,
    name: String,
    last_opened_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredState {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    auto_open_last: bool,
    #[serde(default)]
    workspaces: Vec<StoredWorkspace>,
}

fn default_version() -> u32 {
    STATE_VERSION
}

impl Default for StoredState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            auto_open_last: false,
            workspaces: Vec::new(),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn state_file(config_dir: &Path) -> PathBuf {
    config_dir.join(STATE_FILE)
}

fn backup_corrupt(path: &Path) {
    let _ = fs::copy(path, path.with_file_name(BACKUP_FILE));
}

fn normalize(mut state: StoredState) -> StoredState {
    state
        .workspaces
        .sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));

    let mut seen = HashSet::new();
    state
        .workspaces
        .retain(|workspace| seen.insert(workspace.path.clone()));
    state.workspaces.truncate(MAX_RECENT);
    state
}

fn read_stored_state(config_dir: &Path) -> StoredState {
    let path = state_file(config_dir);
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(_) => return StoredState::default(),
    };

    match serde_json::from_str::<StoredState>(&raw) {
        Ok(state) if state.version == STATE_VERSION => normalize(state),
        Ok(_) => {
            backup_corrupt(&path);
            StoredState::default()
        }
        Err(_) => {
            backup_corrupt(&path);
            StoredState::default()
        }
    }
}

fn write_stored_state(config_dir: &Path, state: &StoredState) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|error| format!("创建配置目录失败：{error}"))?;

    let path = state_file(config_dir);
    let temp_path = path.with_file_name("workspaces.json.tmp");
    let json = serde_json::to_string_pretty(state)
        .map_err(|error| format!("序列化配置失败：{error}"))?;

    fs::write(&temp_path, json).map_err(|error| format!("写入配置失败：{error}"))?;

    #[cfg(windows)]
    if path.exists() {
        let _ = fs::remove_file(&path);
    }

    fs::rename(&temp_path, &path).map_err(|error| format!("保存配置失败：{error}"))?;
    Ok(())
}

fn to_views(state: &StoredState) -> Vec<RecentWorkspace> {
    state
        .workspaces
        .iter()
        .map(|workspace| RecentWorkspace {
            path: workspace.path.clone(),
            name: workspace.name.clone(),
            last_opened_at: workspace.last_opened_at,
            exists: Path::new(&workspace.path).is_dir(),
        })
        .collect()
}

fn load_state(config_dir: &Path) -> WorkspaceState {
    let state = read_stored_state(config_dir);
    WorkspaceState {
        workspaces: to_views(&state),
        auto_open_last: state.auto_open_last,
    }
}

fn workspace_name(canonical: &Path, path_string: &str) -> String {
    canonical
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| path_string.to_owned())
}

fn open_workspace_at(
    config_dir: &Path,
    path: &str,
    opened_at: u64,
) -> Result<WorkspaceInfo, String> {
    let canonical = dunce::canonicalize(path)
        .map_err(|_| format!("文件夹不存在或无法访问：{path}"))?;

    let metadata =
        fs::metadata(&canonical).map_err(|error| format!("无法访问文件夹：{error}"))?;
    if !metadata.is_dir() {
        return Err("请选择一个文件夹，而不是文件".to_string());
    }

    let path_string = canonical.to_string_lossy().into_owned();
    let name = workspace_name(&canonical, &path_string);

    let mut state = read_stored_state(config_dir);
    state
        .workspaces
        .retain(|workspace| workspace.path != path_string);
    state.workspaces.insert(
        0,
        StoredWorkspace {
            path: path_string.clone(),
            name: name.clone(),
            last_opened_at: opened_at,
        },
    );
    state.workspaces.truncate(MAX_RECENT);
    write_stored_state(config_dir, &state)?;

    Ok(WorkspaceInfo {
        path: path_string,
        name,
    })
}

fn workspace_status_at(path: &str) -> Result<WorkspaceStatus, String> {
    let canonical = dunce::canonicalize(path)
        .map_err(|_| format!("文件夹不存在或无法访问：{path}"))?;

    let metadata =
        fs::metadata(&canonical).map_err(|error| format!("无法访问文件夹：{error}"))?;
    if !metadata.is_dir() {
        return Err("请选择一个文件夹，而不是文件".to_string());
    }

    let path_string = canonical.to_string_lossy().into_owned();

    Ok(WorkspaceStatus {
        name: workspace_name(&canonical, &path_string),
        path: path_string,
        has_site_config: canonical.join("wordma.site.yaml").is_file(),
        has_content_dir: canonical.join("content").is_dir(),
    })
}

fn write_new_file(path: &Path, content: &str, label: &str) -> Result<(), String> {
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(mut file) => file
            .write_all(content.as_bytes())
            .map_err(|error| format!("无法写入{label}：{error}")),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(format!("无法创建{label}：{error}")),
    }
}

fn initialize_workspace_at(path: &str) -> Result<WorkspaceInfo, String> {
    let status = workspace_status_at(path)?;
    let root = PathBuf::from(&status.path);

    if !status.has_site_config {
        let title = serde_json::to_string(&status.name)
            .map_err(|error| format!("无法生成站点标题：{error}"))?;
        let config = format!(
            "site:\n  title: {title}\n  language: zh-CN\n\ntheme:\n  id: wordma-theme-default\n  settings: {{}}\n\nnavigation:\n  - label: 首页\n    path: /\n"
        );

        write_new_file(&root.join("wordma.site.yaml"), &config, "站点配置")?;
    }

    let content = root.join("content");
    if content.exists() {
        let canonical = dunce::canonicalize(&content)
            .map_err(|error| format!("无法访问 content 目录：{error}"))?;
        if !canonical.starts_with(&root) {
            return Err(format!(
                "content 目录必须位于工作区内部：{}",
                content.display()
            ));
        }
    }

    let posts = content.join("posts");
    fs::create_dir_all(&posts).map_err(|error| format!("无法创建 content/posts：{error}"))?;
    fs::create_dir_all(content.join("pages"))
        .map_err(|error| format!("无法创建 content/pages：{error}"))?;

    let has_notes = fs::read_dir(&posts)
        .map_err(|error| format!("无法读取 content/posts：{error}"))?
        .filter_map(Result::ok)
        .any(|entry| {
            let path = entry.path();
            path.is_file()
                && matches!(
                    path.extension().and_then(|value| value.to_str()),
                    Some("md") | Some("mdx")
                )
        });

    if !has_notes {
        write_new_file(&posts.join("welcome.mdx"), WELCOME_NOTE, "示例笔记")?;
    }

    Ok(WorkspaceInfo {
        path: status.path,
        name: status.name,
    })
}

fn remove_workspace_at(config_dir: &Path, path: &str) -> Result<WorkspaceState, String> {
    let mut state = read_stored_state(config_dir);
    let previous_len = state.workspaces.len();
    state.workspaces.retain(|workspace| workspace.path != path);

    if state.workspaces.len() != previous_len {
        write_stored_state(config_dir, &state)?;
    }

    Ok(WorkspaceState {
        workspaces: to_views(&state),
        auto_open_last: state.auto_open_last,
    })
}

fn set_auto_open_last_at(config_dir: &Path, enabled: bool) -> Result<(), String> {
    let mut state = read_stored_state(config_dir);
    state.auto_open_last = enabled;
    write_stored_state(config_dir, &state)
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|error| format!("无法定位应用配置目录：{error}"))
}

#[tauri::command]
pub fn load_workspaces(app: AppHandle) -> Result<WorkspaceState, String> {
    let config_dir = config_dir(&app)?;
    Ok(load_state(&config_dir))
}

#[tauri::command]
pub fn open_workspace(app: AppHandle, path: String) -> Result<WorkspaceInfo, String> {
    let config_dir = config_dir(&app)?;
    open_workspace_at(&config_dir, &path, now_ms())
}

#[tauri::command]
pub fn workspace_status(path: String) -> Result<WorkspaceStatus, String> {
    workspace_status_at(&path)
}

#[tauri::command]
pub fn initialize_workspace(path: String) -> Result<WorkspaceInfo, String> {
    initialize_workspace_at(&path)
}

#[tauri::command]
pub fn remove_recent_workspace(
    app: AppHandle,
    path: String,
) -> Result<WorkspaceState, String> {
    let config_dir = config_dir(&app)?;
    remove_workspace_at(&config_dir, &path)
}

#[tauri::command]
pub fn set_auto_open_last(app: AppHandle, enabled: bool) -> Result<(), String> {
    let config_dir = config_dir(&app)?;
    set_auto_open_last_at(&config_dir, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn make_dir(root: &Path, name: &str) -> PathBuf {
        let path = root.join(name);
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    fn canonical(path: &Path) -> String {
        dunce::canonicalize(path)
            .expect("canonicalize test path")
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn opens_dedupes_and_orders_recent_workspaces() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");
        let first = make_dir(temp.path(), "first");
        let second = make_dir(temp.path(), "second");
        let first_path = canonical(&first);
        let second_path = canonical(&second);

        open_workspace_at(&config, &first_path, 100).expect("open first");
        open_workspace_at(&config, &second_path, 200).expect("open second");
        open_workspace_at(&config, &first_path, 300).expect("reopen first");

        let state = load_state(&config);
        assert_eq!(state.workspaces.len(), 2);
        assert_eq!(state.workspaces[0].path, first_path);
        assert_eq!(state.workspaces[0].last_opened_at, 300);
        assert_eq!(state.workspaces[1].path, second_path);
        assert!(state.workspaces.iter().all(|workspace| workspace.exists));
    }

    #[test]
    fn rejects_files() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");
        let file = temp.path().join("note.md");
        fs::write(&file, "hello").expect("write file");

        let result = open_workspace_at(&config, &canonical(&file), 100);
        assert!(result.is_err());
    }

    #[test]
    fn keeps_only_the_most_recent_entries() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");

        for index in 0..(MAX_RECENT + 3) {
            let path = make_dir(temp.path(), &format!("workspace-{index}"));
            open_workspace_at(&config, &canonical(&path), index as u64)
                .expect("open workspace");
        }

        let state = load_state(&config);
        assert_eq!(state.workspaces.len(), MAX_RECENT);
        assert!(state.workspaces[0].name.starts_with("workspace-"));
    }

    #[test]
    fn removes_entries() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");
        let path = make_dir(temp.path(), "notes");
        let path = canonical(&path);

        open_workspace_at(&config, &path, 100).expect("open workspace");
        let state = remove_workspace_at(&config, &path).expect("remove workspace");

        assert!(state.workspaces.is_empty());
        assert!(load_state(&config).workspaces.is_empty());
    }

    #[test]
    fn marks_missing_directories_as_unavailable() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");
        let path = make_dir(temp.path(), "temporary");
        let path = canonical(&path);

        open_workspace_at(&config, &path, 100).expect("open workspace");
        fs::remove_dir_all(&path).expect("remove directory");

        let state = load_state(&config);
        assert_eq!(state.workspaces.len(), 1);
        assert!(!state.workspaces[0].exists);
    }

    #[test]
    fn recovers_from_corrupt_state_and_keeps_a_backup() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");
        fs::create_dir_all(&config).expect("create config dir");
        fs::write(state_file(&config), "{ not valid json").expect("write corrupt state");

        let state = load_state(&config);
        assert!(state.workspaces.is_empty());
        assert!(config.join(BACKUP_FILE).exists());
    }

    #[test]
    fn toggles_auto_open_last() {
        let temp = tempdir().expect("tempdir");
        let config = temp.path().join("config");

        set_auto_open_last_at(&config, true).expect("enable auto open");
        assert!(load_state(&config).auto_open_last);

        set_auto_open_last_at(&config, false).expect("disable auto open");
        assert!(!load_state(&config).auto_open_last);
    }

    #[test]
    fn reports_missing_site_config_and_content() {
        let temp = tempdir().expect("tempdir");
        let path = make_dir(temp.path(), "empty");

        let status = workspace_status_at(&canonical(&path)).expect("status");
        assert_eq!(status.name, "empty");
        assert!(!status.has_site_config);
        assert!(!status.has_content_dir);
    }

    #[test]
    fn initializes_workspace_and_starter_note() {
        let temp = tempdir().expect("tempdir");
        let path = make_dir(temp.path(), "我的笔记 空间");
        let path = canonical(&path);

        let info = initialize_workspace_at(&path).expect("initialize");
        assert_eq!(info.name, "我的笔记 空间");

        let config = fs::read_to_string(Path::new(&path).join("wordma.site.yaml"))
            .expect("read site config");
        assert!(config.contains("title: \"我的笔记 空间\""));
        assert!(config.contains("id: wordma-theme-default"));
        assert!(Path::new(&path).join("content/posts/welcome.mdx").is_file());
        assert!(Path::new(&path).join("content/pages").is_dir());

        let status = workspace_status_at(&path).expect("status");
        assert!(status.has_site_config);
        assert!(status.has_content_dir);
    }

    #[test]
    fn initialization_does_not_overwrite_existing_files() {
        let temp = tempdir().expect("tempdir");
        let path = make_dir(temp.path(), "notes");
        fs::write(path.join("wordma.site.yaml"), "custom: true\n").expect("write config");
        fs::create_dir_all(path.join("content/posts")).expect("create posts");
        fs::write(path.join("content/posts/existing.mdx"), "keep me").expect("write note");

        initialize_workspace_at(&canonical(&path)).expect("initialize");

        assert_eq!(
            fs::read_to_string(path.join("wordma.site.yaml")).expect("read config"),
            "custom: true\n"
        );
        assert_eq!(
            fs::read_to_string(path.join("content/posts/existing.mdx")).expect("read note"),
            "keep me"
        );
        assert!(!path.join("content/posts/welcome.mdx").exists());
        assert!(path.join("content/pages").is_dir());
    }

    #[test]
    fn initialization_rejects_files() {
        let temp = tempdir().expect("tempdir");
        let file = temp.path().join("note.md");
        fs::write(&file, "hello").expect("write file");

        assert!(workspace_status_at(&canonical(&file)).is_err());
        assert!(initialize_workspace_at(&canonical(&file)).is_err());
    }
}
