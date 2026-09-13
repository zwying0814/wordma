/**
 * @wordma/slug —— 前端侧「标题 → slug」生成（WebAssembly）。
 *
 * 底层是 Rust 编译出的 wasm（`pkg/wordma_slug.js`），核心依赖：
 *   - `rslug`：成熟的 Rust slug 库（小写化、折叠、截断到 128）；
 *   - `pinyin-converter`：中文转拼音（词典分词、去声调、`-` 连接）。
 * 行为与旧版 Tauri 后端命令 `article_slugify` 完全一致，但现在**不再走 IPC**，
 * 可直接在前端 import 使用。
 *
 * 用法：
 * ```ts
 * import { slugify } from "@wordma/slug"
 * const s = await slugify("我的第一篇文章") // "wo-de-di-yi-pian-wen-zhang"
 * ```
 *
 * 注意：wasm 体积较大（约 9.5 MB，主要是拼音词典），因此**按需懒加载**——
 * 只有首次调用 `slugify` / `initSlug` 时才真正下载并实例化 `.wasm`。
 */

import initWasm, { slugify as wasmSlugify, version as wasmVersion } from "./pkg/wordma_slug.js"

/** 已缓存的 wasm 实例化 promise（null 表示尚未开始加载）。 */
let readyPromise = null

/** 确保 wasm 已实例化；重复调用复用同一个 promise。 */
function ensureReady() {
  if (readyPromise === null) {
    readyPromise = initWasm()
  }
  return readyPromise
}

/**
 * 显式预热 wasm（可选）。一般无需手动调用——首个 `slugify` 会自动触发加载。
 * 适合在应用启动/空闲时提前加载，避免用户点击「根据标题生成」时首次卡顿。
 */
export function initSlug() {
  return ensureReady().then(() => undefined)
}

/**
 * 由标题生成 slug（异步）。
 * @param {string} input 任意标题（可含中文 / 英文 / 符号）
 * @returns {Promise<string>} ASCII、小写、以 `-` 分隔的文件名安全 slug
 */
export async function slugify(input) {
  await ensureReady()
  return wasmSlugify(input)
}

/** wasm 产物版本号（异步），便于排查产物版本。 */
export async function slugVersion() {
  await ensureReady()
  return wasmVersion()
}
