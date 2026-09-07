import type { SpaceErrorCode } from "@/types/space"

/**
 * 空间名称前端校验（即时反馈用）。
 * ⚠️ Rust 侧 `src-tauri/src/space/commands.rs::validate_name` 是同源副本，
 * 后端必须独立再校验一次——永不信任前端。改这里务必同步改 Rust。
 */
export type NameValidation =
  | { ok: true }
  | { ok: false; code: SpaceErrorCode; message: string }

const ILLEGAL_CHARS = /[\\/:*?"<>|]/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

// Windows 保留设备名（大小写不敏感）
const RESERVED_WINDOWS_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
])

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
  if (ILLEGAL_CHARS.test(name)) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: "名称不能包含 \\ / : * ? \" < > | 等字符",
    }
  }
  if (CONTROL_CHARS.test(name)) {
    return { ok: false, code: "INVALID_NAME", message: "名称不能包含控制字符" }
  }
  if (name === "." || name === "..") {
    return { ok: false, code: "INVALID_NAME", message: "名称不能为 . 或 .." }
  }
  if (RESERVED_WINDOWS_NAMES.has(name.toUpperCase())) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `“${name}” 是系统保留名，不可用作文件夹名称`,
    }
  }
  // Windows 会静默截断以 "." / 空格结尾的名称，导致注册路径与磁盘实际路径不一致
  if (name.endsWith(".") || name.endsWith(" ")) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: "名称不能以点或空格结尾",
    }
  }

  return { ok: true }
}
