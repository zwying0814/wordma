//! 空间相关 Tauri 命令。
//!
//! 命令名统一 `space_*`，参数由 Tauri 自动转成驼峰传给前端。所有命令返回
//! `Result<T, SpaceError>`：业务失败走 Err（前端还原为 `{ ok:false, error }`），绝不 panic。
//!
//! ## 换代带来的两个变化
//!
//! - **不再有 `space_path`。** 空间是库里的行，用 `id` 指代。以前每个命令都要
//!   先解析一个文件路径、判断它是文件还是目录、能不能认出来——这些全没了。
//! - **`space_open` 消失了。** 「打开一个空间」和「切换当前空间」现在是一件事
//!   （[`space_set_active`]）。
//! - **`space_remove` 变危险了。** 以前它只删注册表里的一条记录，磁盘上的库文件
//!   原封不动；现在内容就在同一个库里，删空间 = **连文章一起删**（`ON DELETE CASCADE`）。
//!   调用方必须先向用户明确确认；[`space_article_count`] 就是给确认框取数量用的。
//!
//! 前端契约见 `src/lib/tauri/space-api.ts`。
//!
//! 历史版本的导入命令（`space_import_legacy` / `space_scan`）已随旧版数据格式一并移除。

use std::path::PathBuf;

use rusqlite::Connection;
use tauri::AppHandle;

use super::db as space_db;
use super::model::{CreateSpaceData, Space, SpaceError, SpaceErrorCode, SpaceSnapshot};
use super::store;
use crate::db;

// ===== 名称校验（前端 `src/lib/space-name.ts` 的同源副本） =====
// 前端只用于即时反馈，这里必须独立再校验一次——永不信任前端。

const MAX_NAME_LENGTH: usize = 64;

/// 空间名只约束「是不是个像样的名字」。
///
/// 旧版这里还挡 `\ / : * ? " < > |` 与 `CON`/`PRN` 这类保留名，因为那时空间名会
/// 变成**文件夹名**。现在它只是库里的一列，永远不会落到文件系统上
/// （导出用的是文章 slug，不是空间名），所以那些限制全部取消——
/// 一个叫「电池: 界面」的空间没有任何问题，不该被拦。
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
    if name.chars().any(|c| c.is_control()) {
        return Err(SpaceError::new(
            SpaceErrorCode::InvalidName,
            "名称不能包含控制字符",
        ));
    }

    Ok(name.to_string())
}

// ===== 内部工具 =====

/// 打开应用库。**所有空间/文章命令的第一句。**
fn open(app: &AppHandle) -> Result<Connection, SpaceError> {
    space_db::open(app).map_err(SpaceError::from)
}

fn snapshot(app: &AppHandle, conn: &Connection) -> Result<SpaceSnapshot, SpaceError> {
    let spaces = store::load_spaces(conn)?;
    let active = store::active_space_id(conn)?;
    let db_path = space_db::path_for(app)
        .map_err(SpaceError::from)?
        .to_string_lossy()
        .to_string();
    Ok(store::snapshot_of(&spaces, active, db_path))
}

// ===== 命令 =====

/// 列出全部空间 + 当前激活空间 id + 库文件位置。
#[tauri::command]
pub fn space_list(app: AppHandle) -> Result<SpaceSnapshot, SpaceError> {
    let conn = open(&app)?;
    snapshot(&app, &conn)
}

/// 新建空间：往 `spaces` 表插一行并切过去。
///
/// 与旧版的区别：**不再需要用户选一个文件位置**。「一个空间一个文件」时用户得先
/// 想好这个库放哪、叫什么文件名；现在只有名字和图标。
#[tauri::command]
pub fn space_create(
    app: AppHandle,
    name: String,
    icon: String,
) -> Result<CreateSpaceData, SpaceError> {
    let name = validate_name(&name)?;
    let conn = open(&app)?;

    if let Some(existing) = store::find_by_name(&conn, &name)? {
        return Err(SpaceError::new(
            SpaceErrorCode::DuplicateName,
            format!("已有一个叫「{}」的空间，请换一个名字", existing.name),
        ));
    }

    let now = store::now_millis();
    let space = Space {
        id: store::new_id(&name),
        name,
        icon,
        description: String::new(),
        created_at: now,
        last_opened_at: now,
    };
    store::insert_space(&conn, &space)?;
    store::set_active(&conn, Some(space.id.as_str()))?;

    Ok(CreateSpaceData {
        snapshot: snapshot(&app, &conn)?,
        space,
    })
}

/// 切换当前空间。
#[tauri::command]
pub fn space_set_active(app: AppHandle, id: String) -> Result<SpaceSnapshot, SpaceError> {
    let conn = open(&app)?;

    let Some(space) = store::find_by_id(&conn, &id)? else {
        return Err(SpaceError::new(
            SpaceErrorCode::NotFound,
            "空间不存在，可能已被移除",
        ));
    };

    store::touch(&conn, &space.id, store::now_millis())?;
    store::set_active(&conn, Some(space.id.as_str()))?;
    snapshot(&app, &conn)
}

/// 某个空间下有多少篇文章。给「删除空间」的确认框显示代价用。
#[tauri::command]
pub fn space_article_count(app: AppHandle, id: String) -> Result<u64, SpaceError> {
    let conn = open(&app)?;
    if store::find_by_id(&conn, &id)?.is_none() {
        return Err(SpaceError::new(
            SpaceErrorCode::NotFound,
            "空间不存在，可能已被移除",
        ));
    }
    store::article_count(&conn, &id)
}

/// 删除空间——**连同它名下的全部文章与标签**。
///
/// ⚠️ 与旧版语义完全不同：旧版是「从列表移除」，磁盘上的 `.db` 还在，可以再打开；
/// 现在内容就在同一个库里，删除就是销毁，没有别的副本可找。
/// 前端必须先把 [`space_article_count`] 的结果摊给用户确认。
///
/// 删除的是当前激活空间时，回退到列表中第一个空间。
#[tauri::command]
pub fn space_remove(app: AppHandle, id: String) -> Result<SpaceSnapshot, SpaceError> {
    let conn = open(&app)?;

    if !store::delete_space(&conn, &id)? {
        return Err(SpaceError::new(
            SpaceErrorCode::NotFound,
            "空间不存在，可能已被移除",
        ));
    }

    if store::active_space_id(&conn)?.as_deref() == Some(id.as_str()) {
        let next = store::load_spaces(&conn)?.first().map(|s| s.id.clone());
        store::set_active(&conn, next.as_deref())?;
    }

    snapshot(&app, &conn)
}

/// 备份整个笔记库（`VACUUM INTO`，产出一份完整副本）。
///
/// 这不是可选项。现在**所有空间、所有笔记都在一个二进制文件里**，
/// 损坏时没有「另外十个文件还是好的」这种缓冲，也没有 git 历史可回滚——
/// 用户必须有一条一键留底的退路。目标文件已存在会报错（`VACUUM INTO` 本身拒绝覆盖）。
#[tauri::command]
pub fn space_backup(app: AppHandle, dest: String) -> Result<(), SpaceError> {
    if dest.trim().is_empty() {
        return Err(SpaceError::new(SpaceErrorCode::InvalidPath, "未指定备份位置"));
    }
    let target = PathBuf::from(dest.trim());
    if target.exists() {
        return Err(SpaceError::new(
            SpaceErrorCode::AlreadyExists,
            "该位置已存在同名文件，请换一个位置或名字",
        ));
    }

    let conn = open(&app)?;
    // 注意：VACUUM 不能在事务里执行。这里没有开事务，保持 autocommit 即可。
    db::backup_to(&conn, &target).map_err(SpaceError::from)?;
    Ok(())
}
