import type { ArticleErrorCode } from "@/types/article"

/**
 * 文章 slug（文件名）前端校验（即时反馈用）。
 * ⚠️ Rust 侧 `src-tauri/src/article/commands.rs::validate_slug` 是同源副本，
 * 后端必须独立再校验一次——永不信任前端。改这里务必同步改 Rust。
 */
export type NameValidation =
  | { ok: true }
  | { ok: false; code: ArticleErrorCode; message: string }

/**
 * slug 允许的字符集：ASCII 字母、数字、连字符、下划线。
 *
 * 收窄到白名单而非列举非法字符，是为了让 slug 与文件名彻底解耦于平台差异：
 * 路径分隔符、控制字符、`.`/`..`、结尾点/空格、全角字符、中文等一律不在集合内，
 * 由此天然排除路径穿越与非 ASCII 文件名在跨平台/URL 场景下的转义问题。
 */
const ALLOWED_CHARS = /^[A-Za-z0-9_-]+$/
const DISALLOWED_CHARS = /[^A-Za-z0-9_-]/g

// Windows 保留设备名（大小写不敏感），`CON.mdx` 之类在 Windows 上打不开
const RESERVED_WINDOWS_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
])

export const MAX_ARTICLE_NAME_LENGTH = 128

/** 字符集说明，供 UI 文案与校验提示共用，避免两处措辞漂移 */
export const SLUG_CHARSET_HINT = "只能包含字母、数字、- 和 _"

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
  if (!ALLOWED_CHARS.test(slug)) {
    // 指出具体是哪些字符不合法，比只说"只能包含…"更容易纠正
    const bad = Array.from(new Set(slug.match(DISALLOWED_CHARS) ?? []))
    const shown = bad.slice(0, 5).map((c) => `“${c}”`).join("、")
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `slug ${SLUG_CHARSET_HINT}；不支持 ${shown}${bad.length > 5 ? " 等" : ""}`,
    }
  }
  if (RESERVED_WINDOWS_NAMES.has(slug.toUpperCase())) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `“${slug}” 是系统保留名，不可用作文件名`,
    }
  }

  return { ok: true }
}

/**
 * 输入框实时清洗：丢掉所有不在白名单内的字符。
 * 与 `validateArticleSlug` 共用同一字符集，保证「打不出来的字符」与
 * 「校验不过的字符」永远一致。用于 onChange（输入阶段）。
 */
export function sanitizeSlugInput(value: string): string {
  return value.replace(DISALLOWED_CHARS, "")
}

/**
 * 由文章标题生成合法 slug：仅当最终没有可用字符时回退到 "untitled"。
 *
 * 注意：这是 **浏览器预览 / wasm 不可用时的降级实现**，无法做汉字转拼音，
 * 中文标题会被过滤到只剩分隔符从而落到 "untitled"。
 * 正常路径由 `@wordma/slug`（Rust + pinyin-converter）负责，中文可转成拼音。
 */
export function slugify(title: string): string {
  const replaced = title
    .trim()
    .normalize("NFKD") // é → e + 组合音标
    .replace(/[\u0300-\u036f]/g, "") // 去掉组合音标，Latin 重音字符还原为 ASCII
    .replace(/[^A-Za-z0-9_]+/g, "-") // 其余（含中文、空白、符号）统一折叠为连字符
    .replace(/-+/g, "-") // 合并连续连字符
    .replace(/^-+|-+$/g, "") // 去掉首尾连字符
  return replaced.length > 0 ? replaced : "untitled"
}
