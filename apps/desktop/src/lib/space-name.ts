import type { SpaceErrorCode } from "@/types/space"

/**
 * 空间名称前端校验（即时反馈用）。
 * ⚠️ Rust 侧 `src-tauri/src/space/commands.rs::validate_name` 是同源副本，
 * 后端必须独立再校验一次——永不信任前端。改这里务必同步改 Rust。
 *
 * **换代之后只剩「是不是个像样的名字」**：旧版空间名会变成文件夹名，所以这里挡
 * `\ / : * ? " < > |` 与 `CON`/`PRN` 这类 Windows 保留名；现在空间只是 `spaces`
 * 表里的一列，永远不会落到文件系统上（导出用的是文章 slug，不是空间名），
 * 那些限制全部取消——叫「电池: 界面」的空间没有任何问题。
 */
export type NameValidation =
  | { ok: true }
  | { ok: false; code: SpaceErrorCode; message: string }

// 控制字符（含 DEL）
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export const MAX_SPACE_NAME_LENGTH = 64

export function validateSpaceName(raw: string): NameValidation {
  const name = raw.trim()

  if (name.length === 0) {
    return { ok: false, code: "INVALID_NAME", message: "名称不能为空" }
  }
  if (name.length > MAX_SPACE_NAME_LENGTH) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `名称不能超过 ${MAX_SPACE_NAME_LENGTH} 个字符`,
    }
  }
  if (CONTROL_CHARS.test(name)) {
    return { ok: false, code: "INVALID_NAME", message: "名称不能包含控制字符" }
  }

  return { ok: true }
}
