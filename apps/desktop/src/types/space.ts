import type { SpaceIconName } from "@/lib/space-icons"

/**
 * ⚠️ 此文件是渲染层类型真理之源，与 Rust 侧 `src-tauri/src/space/model.rs` 互为镜像。
 * Rust 那边有 serde 强类型兜底，但两边的字段命名与错误码仍是一一对应的契约，
 * 改这里务必同步改 Rust 模型，反之亦然（Rust 用 `rename_all = "camelCase"` 对齐驼峰）。
 *
 * **整个应用只有一个库**（`<app_config_dir>/wordma.db`），空间只是库里 `spaces` 表的
 * 一行。所以 `Space` 上**没有 `path`**：空间不再对应磁盘上任何路径，
 * 「文件被挪走 / 找不到空间」这类状态随之消失。
 */

/** 落盘记录 = `spaces` 表的一行，只含可序列化原语（绝不可存 ReactNode / Date / Map） */
export type Space = {
  id: string            // Rust store::new_id() 生成，UI 稳定 key
  name: string          // 显示名，空间内唯一（大小写不敏感）
  icon: SpaceIconName   // 稳定字符串 key，不是组件（IPC 只传 JSON 原语）
  description: string
  createdAt: number     // epoch ms（不用 Date，JSON 会退化成字符串）
  lastOpenedAt: number
}

export type SpaceSnapshot = {
  spaces: Space[]
  activeSpaceId: string | null
  /** 笔记库文件的绝对路径——整个应用只有这一个文件，用于展示位置与备份 */
  dbPath: string
}

/** 字面量联合，不用 enum（erasableSyntaxOnly 禁用） */
export type SpaceErrorCode =
  | "INVALID_NAME"
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "DUPLICATE_NAME"
  | "ALREADY_EXISTS"
  | "INVALID_SPACE_FILE"
  | "PERMISSION_DENIED"
  | "STORE_UNAVAILABLE"
  | "UNKNOWN"

export type SpaceError = { code: SpaceErrorCode; message: string }

/** 统一返回信封：命令在 Rust 侧返回 Err，由 bridge 还原成此结构（IPC 不保留 Error 子类） */
export type SpaceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SpaceError }

/**
 * 新建空间入参。
 *
 * 旧版这里要带 `spacePath`（用户得先用系统对话框给这个 `.db` 选位置和文件名）；
 * 现在只有一个库，空间只是表里的一行，所以**只剩名字和图标**。
 */
export type CreateSpaceInput = { name: string; icon: string }

export type CreateSpaceData = SpaceSnapshot & { space: Space }
