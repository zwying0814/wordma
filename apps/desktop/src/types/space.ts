import type { SpaceIconName } from "@/lib/space-icons"

/**
 * ⚠️ 此文件是渲染层类型真理之源，与 Rust 侧 `src-tauri/src/space/model.rs` 互为镜像。
 * Rust 那边有 serde 强类型兜底，但两边的字段命名与错误码仍是一一对应的契约，
 * 改这里务必同步改 Rust 模型，反之亦然（Rust 用 `rename_all = "camelCase"` 对齐驼峰）。
 */

/** 落盘记录，只含可序列化原语（绝不可存 ReactNode / Date / Map） */
export type Space = {
  id: string            // Rust store::new_id() 生成，UI 稳定 key
  name: string          // 显示名，默认=文件夹名
  path: string          // 绝对路径，业务唯一键（去重靠规范化后的路径比较）
  icon: SpaceIconName   // 稳定字符串 key，不是组件（IPC 只传 JSON 原语）
  description: string
  createdAt: number     // epoch ms（不用 Date，JSON 会退化成字符串）
  lastOpenedAt: number
}

/** IPC 返回的视图对象 = 落盘记录 + 运行时派生态 */
export type SpaceView = Space & { exists: boolean }   // exists 不落盘

export type SpaceSnapshot = { spaces: SpaceView[]; activeSpaceId: string | null }

/** 字面量联合，不用 enum（erasableSyntaxOnly 禁用） */
export type SpaceErrorCode =
  | "CANCELLED"
  | "INVALID_NAME"
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "NOT_A_DIRECTORY"
  | "DIR_EXISTS"
  | "DIR_NOT_EMPTY"
  | "ALREADY_REGISTERED"
  | "NOT_WORDMA_SPACE"
  | "INVALID_SPACE_FILE"
  | "PERMISSION_DENIED"
  | "STORE_UNAVAILABLE"
  | "UNKNOWN"

export type SpaceError = { code: SpaceErrorCode; message: string }

/** 统一返回信封：命令在 Rust 侧返回 Err，由 bridge 还原成此结构（IPC 不保留 Error 子类） */
export type SpaceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SpaceError }

/** 新建空间需传入用户选择的文件夹（spaceDir），Rust 侧在其中写入标记文件，
 *  不再固定创建在 %LOCALAPPDATA% 默认数据目录下（与 wordma-ban 的逻辑一致）。 */
export type CreateSpaceInput = { spaceDir: string; name: string; icon: string }

export type CreateSpaceData = SpaceSnapshot & { space: SpaceView }
export type OpenSpaceData = SpaceSnapshot & { space: SpaceView; adopted: boolean }

/** 默认数据目录扫描结果（space_scan 命令返回项），与 Rust ScannedSpace 镜像 */
export type ScannedSpace = {
  id: string
  name: string
  icon: SpaceIconName
  description: string
  path: string
  createdAt: number
  /** 目录是否已在空间注册表中 */
  registered: boolean
}
