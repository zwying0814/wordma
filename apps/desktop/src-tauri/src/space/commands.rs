//! 空间相关 Tauri 命令。
//!
//! 命令名统一 `space_*`，参数由 Tauri 自动转成驼峰传给前端
//! （`space_dir` → `spaceDir`）。所有命令返回 `Result<T, SpaceError>`：
//! 业务失败走 Err（前端还原为 `{ ok:false, error }`），绝不 panic。
//!
//! 前端契约见 `src/lib/tauri/space-api.ts`。

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::model::{
    CreateSpaceData, OpenSpaceData, ScannedSpace, Space, SpaceError, SpaceErrorCode, SpaceSnapshot,
};
use super::store;

/// 历史空间根目录（相对 `app_local_data_dir()`）。仅 `space_scan` 仍用它发现
/// 旧版在默认数据目录下创建的空间；新建空间已改为用户自选任意文件夹（见 `space_create`）。
const SPACES_ROOT: &str = "spaces";

/// 空间标记文件（相对空间目录）。目录里有它才算一个 wordma 空间。
const MARKER_DIR: &str = ".wordma";
const MARKER_FILE: &str = "space.json";

/// 标记文件内容：空间被移动/复制到别处后仍能被认出来。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpaceMarker {
    id: String,
    name: String,
    icon: String,
    description: String,
    created_at: u64,
}

fn marker_rel_path() -> PathBuf {
    Path::new(MARKER_DIR).join(MARKER_FILE)
}

// ===== 名称校验（前端 `src/lib/space-name.ts` 的同源副本） =====
// 前端只用于即时反馈，这里必须独立再校验一次——永不信任前端。

const MAX_NAME_LENGTH: usize = 64;
const ILLEGAL_CHARS: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn validate_name(raw: &str) -> Result<String, SpaceError> {
    let name = raw.trim();

    if name.is_empty() {
        return Err(SpaceError::new(SpaceErrorCode::InvalidName, "名称不能为空"));
    }
    if name.chars().count() > MAX_NAME_LENGTH {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            format!("名称不能超过 {MAX_NAME_LENGTH} 个字符"),
        ));
    }
    if name.chars().any(|c| ILLEGAL_CHARS.contains(&c)) {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            "名称不能包含 \\ / : * ? \" < > | 等字符",
        ));
    }
    if name.chars().any(|c| c.is_control()) {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            "名称不能包含控制字符",
        ));
    }
    if name == "." || name == ".." {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            "名称不能为 . 或 ..",
        ));
    }
    if WINDOWS_RESERVED.contains(&name.to_uppercase().as_str()) {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            "该名称是系统保留名，不可用作空间名称",
        ));
    }
    // Windows 会静默截断以 "." / 空格结尾的名称
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            "名称不能以点或空格结尾",
        ));
    }

    Ok(name.to_string())
}

/// 校验目录：必须存在且确实是目录。
fn validate_dir(space_dir: &str) -> Result<PathBuf, SpaceError> {
    if space_dir.trim().is_empty() {
        return Err(SpaceError::new(SpaceErrorCode::InvalidPath, "未选择文件夹"));
    }
    let path = Path::new(space_dir);
    if !path.exists() {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidPath,
            "文件夹不存在，请重新选择",
        ));
    }
    if !path.is_dir() {
        return Err(SpaceError::new(
            SpaceErrorCode::NotADirectory,
            "选择的不是文件夹",
        ));
    }
    Ok(path.to_path_buf())
}

// 注意：一律用「索引」而非「返回的 &mut Space」来定位记录。
// `match find(&mut registry) { None => registry.push(..) }` 会撞上 NLL 的
// 借用检查限制（match scrutinee 的借用活到整个 match 结束），索引写法没有这个问题。

fn index_of_id(registry: &store::Registry, id: &str) -> Option<usize> {
    registry.spaces.iter().position(|s| s.id == id)
}

fn index_of_path(registry: &store::Registry, key: &str) -> Option<usize> {
    registry
        .spaces
        .iter()
        .position(|s| store::dedupe_key(&s.path) == key)
}

fn write_marker(dir: &Path, marker: &SpaceMarker) -> Result<(), SpaceError> {
    let marker_dir = dir.join(MARKER_DIR);
    fs::create_dir_all(&marker_dir)
        .map_err(|e| super::model::from_io_error(&e, "创建空间配置目录失败"))?;
    let json = serde_json::to_string_pretty(marker)
        .map_err(|e| SpaceError::new(SpaceErrorCode::Unknown, format!("生成空间配置失败：{e}")))?;
    fs::write(dir.join(marker_rel_path()), json)
        .map_err(|e| super::model::from_io_error(&e, "写入空间配置失败"))
}

fn read_marker(dir: &Path) -> Result<SpaceMarker, SpaceError> {
    let marker_path = dir.join(marker_rel_path());
    if !marker_path.is_file() {
        return Err(SpaceError::new(
            SpaceErrorCode::NotWordmaSpace,
            "该文件夹不是 wordma 笔记空间（缺少 .wordma/space.json）",
        ));
    }
    let raw = fs::read_to_string(&marker_path)
        .map_err(|e| super::model::from_io_error(&e, "读取空间配置失败"))?;
    serde_json::from_str(&raw).map_err(|e| {
        SpaceError::new(
            SpaceErrorCode::InvalidSpaceFile,
            format!("空间配置文件已损坏：{e}"),
        )
    })
}

// ===== 命令 =====

/// 列出全部空间 + 当前激活空间 id。顺带刷新每条记录的 exists 派生态。
#[tauri::command]
pub fn space_list(app: AppHandle) -> Result<SpaceSnapshot, SpaceError> {
    let registry = store::load(&app)?;
    Ok(store::snapshot_of(&registry, &marker_rel_path()))
}

/// 新建空间：用户选择一个空文件夹（spaceDir），wordma 在其中写入标记文件
/// `.wordma/space.json` 把它标记为笔记空间，不再固定创建在 %LOCALAPPDATA% 下
/// （与 wordma-ban 一致：空间位置完全由用户决定）。非空或已在列表中的目录会报错。
#[tauri::command]
pub fn space_create(
    app: AppHandle,
    space_dir: String,
    name: String,
    icon: String,
) -> Result<CreateSpaceData, SpaceError> {
    let name = validate_name(&name)?;
    let dir = validate_dir(&space_dir)?;

    let key = store::dedupe_key(&space_dir);
    let mut registry = store::load(&app)?;
    if index_of_path(&registry, &key).is_some() {
        return Err(SpaceError::new(
            SpaceErrorCode::AlreadyRegistered,
            "该目录已在空间列表中",
        ));
    }

    // 与 wordma-ban 一致：要求所选文件夹为空（含已有 .wordma 标记的目录请用「打开」接入）。
    let dir_is_empty = fs::read_dir(&dir)
        .map_err(|e| super::model::from_io_error(&e, "读取文件夹失败"))?
        .next()
        .is_none();
    if !dir_is_empty {
        return Err(SpaceError::new(
            SpaceErrorCode::DirNotEmpty,
            "所选文件夹不是空文件夹，请选择一个空文件夹来创建空间",
        ));
    }

    let path_str = dir.to_string_lossy().to_string();
    let now = store::now_millis();
    let id = store::new_id(&path_str);

    write_marker(
        &dir,
        &SpaceMarker {
            id: id.clone(),
            name: name.clone(),
            icon: icon.clone(),
            description: String::new(),
            created_at: now,
        },
    )?;

    let space = Space {
        id: id.clone(),
        name,
        path: path_str,
        icon,
        description: String::new(),
        created_at: now,
        last_opened_at: now,
    };

    registry.spaces.push(space.clone());
    registry.active_space_id = Some(id);
    store::save(&app, &registry)?;

    Ok(CreateSpaceData {
        snapshot: store::snapshot_of(&registry, &marker_rel_path()),
        space: store::to_view(&space, &marker_rel_path()),
    })
}

/// 打开已有空间：目录必须含合法标记文件。已在列表中则仅切换，否则接入。
#[tauri::command]
pub fn space_open(app: AppHandle, space_dir: String) -> Result<OpenSpaceData, SpaceError> {
    let dir = validate_dir(&space_dir)?;
    let key = store::dedupe_key(&space_dir);
    let marker = read_marker(&dir)?;

    let mut registry = store::load(&app)?;
    let path_str = dir.to_string_lossy().to_string();
    let now = store::now_millis();

    let (space, adopted) = match index_of_path(&registry, &key) {
        // 已注册 → 只切过去，并以磁盘上的标记文件为准刷新展示信息
        Some(index) => {
            let existing = &mut registry.spaces[index];
            existing.name = marker.name.clone();
            existing.icon = marker.icon.clone();
            existing.description = marker.description.clone();
            existing.last_opened_at = now;
            registry.active_space_id = Some(existing.id.clone());
            (existing.clone(), false)
        }
        // 未注册 → 按标记文件接入；id 撞车时重新生成一个
        None => {
            let id = if index_of_id(&registry, &marker.id).is_some() {
                store::new_id(&space_dir)
            } else {
                marker.id.clone()
            };
            let space = Space {
                id: id.clone(),
                name: marker.name.clone(),
                path: path_str,
                icon: marker.icon.clone(),
                description: marker.description.clone(),
                created_at: marker.created_at,
                last_opened_at: now,
            };
            registry.spaces.push(space.clone());
            registry.active_space_id = Some(id);
            (space, true)
        }
    };

    store::save(&app, &registry)?;

    Ok(OpenSpaceData {
        snapshot: store::snapshot_of(&registry, &marker_rel_path()),
        space: store::to_view(&space, &marker_rel_path()),
        adopted,
    })
}

/// 扫描默认数据目录 `spaces/` 下的已有空间：子目录含合法标记文件即算命中。
/// 不存在 / 非目录 / 损坏的条目一律静默跳过，绝不因为一个坏目录让扫描整体失败。
#[tauri::command]
pub fn space_scan(app: AppHandle) -> Result<Vec<ScannedSpace>, SpaceError> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| SpaceError::new(SpaceErrorCode::StoreUnavailable, e.to_string()))?
        .join(SPACES_ROOT);

    let mut found: Vec<ScannedSpace> = Vec::new();
    if !root.is_dir() {
        return Ok(found);
    }

    let registry = store::load(&app)?;
    let entries = fs::read_dir(&root)
        .map_err(|e| super::model::from_io_error(&e, "扫描数据目录失败"))?;

    for entry in entries {
        let entry = entry.map_err(|e| super::model::from_io_error(&e, "扫描数据目录失败"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(marker) = read_marker(&path) else {
            continue;
        };

        let path_str = path.to_string_lossy().to_string();
        let key = store::dedupe_key(&path_str);
        let registered = registry
            .spaces
            .iter()
            .any(|s| store::dedupe_key(&s.path) == key);

        found.push(ScannedSpace {
            id: marker.id,
            name: marker.name,
            icon: marker.icon,
            description: marker.description,
            path: path_str,
            created_at: marker.created_at,
            registered,
        });
    }

    // 先创建的空间排前面（与注册表的时间语义一致）
    found.sort_by_key(|s| s.created_at);
    Ok(found)
}

/// 切换当前激活空间。
#[tauri::command]
pub fn space_set_active(app: AppHandle, id: String) -> Result<SpaceSnapshot, SpaceError> {
    let mut registry = store::load(&app)?;

    match index_of_id(&registry, &id) {
        Some(index) => {
            registry.spaces[index].last_opened_at = store::now_millis();
            registry.active_space_id = Some(id);
        }
        None => {
            return Err(SpaceError::new(
                SpaceErrorCode::NotFound,
                "空间不存在，可能已被移除",
            ))
        }
    }

    store::save(&app, &registry)?;
    Ok(store::snapshot_of(&registry, &marker_rel_path()))
}

/// 从列表移除空间（只删记录，绝不碰磁盘文件）。
/// 移除的是当前激活空间时，回退到列表中第一个空间。
#[tauri::command]
pub fn space_remove(app: AppHandle, id: String) -> Result<SpaceSnapshot, SpaceError> {
    let mut registry = store::load(&app)?;

    let before = registry.spaces.len();
    registry.spaces.retain(|s| s.id != id);

    if registry.spaces.len() == before {
        return Err(SpaceError::new(
            SpaceErrorCode::NotFound,
            "空间不存在，可能已被移除",
        ));
    }

    if registry.active_space_id.as_deref() == Some(id.as_str()) {
        registry.active_space_id = registry.spaces.first().map(|s| s.id.clone());
    }

    store::save(&app, &registry)?;
    Ok(store::snapshot_of(&registry, &marker_rel_path()))
}

/// 探测桌面端能力是否就绪——比让前端 try/catch 一个业务命令更明确。
#[tauri::command]
pub fn space_ping() -> Result<bool, SpaceError> {
    Ok(true)
}
