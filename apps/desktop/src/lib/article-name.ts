import type { ArticleErrorCode } from "@/types/article"

/**
 * 文章 slug（文件名）前端校验（即时反馈用）。
 * ⚠️ Rust 侧 `src-tauri/src/article/commands.rs::validate_slug` 是同源副本，
 * 后端必须独立再校验一次——永不信任前端。改这里务必同步改 Rust。
 */
export type NameValidation =
  | { ok: true }
  | { ok: false; code: ArticleErrorCode; message: string }

const ILLEGAL_CHARS = /[\\/:*?"<>|]/
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

// Windows 保留设备名（大小写不敏感），`CON.mdx` 之类在 Windows 上打不开
const RESERVED_WINDOWS_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
])

export const MAX_ARTICLE_NAME_LENGTH = 128

export function validateArticleSlug(raw: string): NameValidation {
  const slug = raw.trim()

  if (slug.length === 0) {
    return { ok: false, code: "INVALID_NAME", message: "slug 不能为空" }
  }
  if (slug.length > MAX_ARTICLE_NAME_LENGTH) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `slug 不能超过 ${MAX_ARTICLE_NAME_LENGTH} 个字符`,
    }
  }
  if (ILLEGAL_CHARS.test(slug)) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: "slug 不能包含 \\ / : * ? \" < > | 等字符",
    }
  }
  if (CONTROL_CHARS.test(slug)) {
    return { ok: false, code: "INVALID_NAME", message: "slug 不能包含控制字符" }
  }
  if (slug === "." || slug === "..") {
    return { ok: false, code: "INVALID_NAME", message: "slug 不能为 . 或 .." }
  }
  if (RESERVED_WINDOWS_NAMES.has(slug.toUpperCase())) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `“${slug}” 是系统保留名，不可用作文件名`,
    }
  }
  // Windows 会静默截断以 "." / 空格结尾的名称，导致记录的路径与磁盘实际路径不一致
  if (slug.endsWith(".") || slug.endsWith(" ")) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: "slug 不能以点或空格结尾",
    }
  }

  return { ok: true }
}

/**
 * 由文章标题生成合法 slug：过滤非法文件名字符、空白压成连字符、去掉首尾标点。
 * 保留 CJK（中文 slug 作为文件名是合法的）；仅当结果为空时回退到 "untitled"。
 */
export function slugify(title: string): string {
  const replaced = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-") // 非法文件名字符 → 连字符
    .replace(/\s+/g, "-") // 空白 → 连字符
    .replace(/-+/g, "-") // 合并连续连字符
    .replace(/^[-.]+/, "") // 去掉开头非法起始符
    .replace(/[-.]+$/, "") // 去掉结尾标点/点
  return replaced.length > 0 ? replaced : "untitled"
}
