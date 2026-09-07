//! 空间注册表持久化。
//!
//! 注册表落盘为 `<app_config_dir>/spaces.json`，写文件用「临时文件 + rename」的
//! 原子替换，避免中途崩溃留下半截 JSON 导致整个空间列表读不出来。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::model::{Space, SpaceError, SpaceErrorCode, SpaceSnapshot, SpaceView};

const REGISTRY_FILE: &str = "spaces.json";
const REGISTRY_VERSION: u32 = 1;

/// 注册表整体结构。`version` 为后续迁移留口子。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    pub version: u32,
    pub spaces: Vec<Space>,
    pub active_space_id: Option<String>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            version: REGISTRY_VERSION,
            spaces: Vec::new(),
            active_space_id: None,
        }
    }
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 生成稳定 id：FNV-1a(路径 + 纳秒时间戳 + 进程内自增计数)。
/// 不引入 uuid crate，靠「时间 + 计数」保证同进程内不撞、跨进程几乎不可能撞。
static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn new_id(seed: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tail = format!("{nanos}-{seq}");

    let mut hash: u64 = 0xcbf2_9ce4_8422_2325; // FNV-1a 64bit offset basis
    for byte in seed.as_bytes().iter().chain(tail.as_bytes()) {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    format!("sp_{hash:016x}")
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, SpaceError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| SpaceError::new(SpaceErrorCode::StoreUnavailable, e.to_string()))?;
    Ok(dir.join(REGISTRY_FILE))
}

/// 读注册表。文件不存在 / 内容损坏都退回空注册表，
/// 绝不因为一份坏掉的 JSON 让整个应用卡在错误页。
pub fn load(app: &AppHandle) -> Result<Registry, SpaceError> {
    let path = registry_path(app)?;

    if !path.exists() {
        return Ok(Registry::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|e| super::model::from_io_error(&e, "读取空间列表失败"))?;

    match serde_json::from_str::<Registry>(&raw) {
        Ok(registry) => Ok(registry),
        Err(e) => {
            eprintln!("[wordma] 空间注册表解析失败，已重置：{e}");
            Ok(Registry::default())
        }
    }
}

/// 写注册表：先写 .tmp 再 rename，保证落盘的永远是完整 JSON。
pub fn save(app: &AppHandle, registry: &Registry) -> Result<(), SpaceError> {
    let path = registry_path(app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| super::model::from_io_error(&e, "创建配置目录失败"))?;
    }

    let json = serde_json::to_string_pretty(registry)
        .map_err(|e| SpaceError::new(SpaceErrorCode::Unknown, format!("序列化空间列表失败：{e}")))?;

    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| super::model::from_io_error(&e, "写入空间列表失败"))?;

    // Windows 上 rename 不允许覆盖已存在文件，先删再改名
    if path.exists() {
        fs::remove_file(&path).map_err(|e| super::model::from_io_error(&e, "替换空间列表失败"))?;
    }
    fs::rename(&tmp, &path).map_err(|e| super::model::from_io_error(&e, "替换空间列表失败"))?;

    Ok(())
}

/// 去重键：同一目录的不同写法（`C:\a\b` / `\\?\C:\a\b` / 末尾斜杠）必须判为同一个空间。
/// 只对「能解析的真实路径」做规范化，解析失败就退回原串——用于比较，绝不回写展示路径。
pub fn dedupe_key(path: &str) -> String {
    let p = Path::new(path);
    fs::canonicalize(p)
        .map(|c| c.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.trim_end_matches(['/', '\\']).to_string())
}

/// 目录是否仍是一个有效空间：目录存在且标记文件完好。
pub fn space_exists(path: &str, marker_rel: &Path) -> bool {
    let dir = Path::new(path);
    dir.is_dir() && dir.join(marker_rel).is_file()
}

pub fn to_view(space: &Space, marker_rel: &Path) -> SpaceView {
    SpaceView {
        space: space.clone(),
        exists: space_exists(&space.path, marker_rel),
    }
}

pub fn snapshot_of(registry: &Registry, marker_rel: &Path) -> SpaceSnapshot {
    SpaceSnapshot {
        spaces: registry.spaces.iter().map(|s| to_view(s, marker_rel)).collect(),
        active_space_id: registry.active_space_id.clone(),
    }
}
