import { initSlug, slugify as wasmSlugify } from "@wordma/slug"

import { slugify as slugifyLocal } from "@/lib/article-name"

/**
 * 预热 slug wasm（幂等，可安全多次调用）。
 *
 * 背景：`@wordma/slug` 首次调用要付两笔一次性开销：
 *   1. 加载并实例化 wasm（约 9.5 MB，其中 7.9 MB 是词组表、0.5 MB 是单字表）；
 *   2. **惰性构建词典**——`pinyin-converter` 内部用 `OnceLock` 在首次转换时
 *      才把约 8.4 MB 的内嵌文本解析成哈希表（见其 `loader.rs::Lexicon::new`）。
 *
 * 所以**只实例化 wasm 是不够的**，必须真正跑一次转换，才能把第 2 笔开销
 * 也提前消化掉。这正是「点击按钮有明显卡顿」的主因。
 *
 * 在对话框打开时与应用空闲时调用本函数，把这两笔开销挪到用户还在输入标题的
 * 空档里。失败不抛错——真正调用时会重试，仍失败则回退本地实现。
 */
export function warmUpSlug(): void {
  void (async () => {
    await initSlug()
    // 跑一次真实转换以触发词典惰性初始化
    await wasmSlugify(WARMUP_TEXT)
  })().catch(() => {
    // 预热失败静默忽略（例如 pkg 未构建 / 环境不支持 WebAssembly）
  })
}

/** 预热用的示例文本，仅用于触发词典初始化，结果直接丢弃。 */
const WARMUP_TEXT = "预热 slug 生成器"

/**
 * 标题 → 合法文件名 slug 的高层封装。
 *
 * 现在由**前端 wasm 包** `@wordma/slug` 直接计算（Rust `rslug` + 拼音转写），
 * **不再走 Tauri 后端命令**——旧的 `article_slugify` 命令已移除。
 *
 * wasm 加载或执行失败时（例如 pkg 未构建、运行环境不支持 WebAssembly），
 * 回退到本地 `slugify`（纯 ASCII 化，无法转拼音，中文标题会落到 "untitled"），
 * 保证功能不中断。
 */
export async function generateArticleSlug(title: string): Promise<string> {
  try {
    const s = await wasmSlugify(title.trim())
    if (s.length > 0) return s
  } catch {
    // wasm 不可用时降级到本地实现
  }
  return slugifyLocal(title)
}
