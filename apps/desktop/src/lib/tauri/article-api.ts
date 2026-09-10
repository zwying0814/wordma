import { invoke, isTauri } from "@tauri-apps/api/core"

import { slugify as slugifyLocal } from "@/lib/article-name"
import type {
  ArticleError,
  ArticleListData,
  ArticleResult,
  ArticleSlugifyData,
  CreateArticleData,
  CreateArticleInput,
} from "@/types/article"

/**
 * Tauri 侧文章能力的唯一出口——替代已随 Electron 移除的 `lib/electron-bridge`。
 *
 * 设计要点：
 *  - 业务命令一律走 `invoke` 调 Rust（`src-tauri/src/article/commands.rs`），
 *    命令名 `article_*`；参数由 Tauri 自动做驼峰转换（`spacePath` → `space_path`）。
 *  - **命令绝不 reject**：Rust 的 `Err(ArticleError)` 被还原成 `{ ok:false, error }`，
 *    与 space 模块保持同一套信封语义，store / 组件层无需感知底层。
 */
const NOT_AVAILABLE: ArticleError = {
  code: "UNKNOWN",
  message: "桌面端能力不可用（当前为浏览器预览模式）",
}

/** 把 invoke 抛出的未知异常还原成 ArticleError。Rust 侧 Err 序列化后就是 { code, message }。 */
function toArticleError(e: unknown): ArticleError {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const { code, message } = e as { code?: unknown; message?: unknown }
    if (typeof code === "string" && typeof message === "string") {
      return { code: code as ArticleError["code"], message }
    }
  }
  if (typeof e === "string") return { code: "UNKNOWN", message: e }
  return { code: "UNKNOWN", message: e instanceof Error ? e.message : String(e) }
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<ArticleResult<T>> {
  // 浏览器预览模式（vite dev 直开）：没有 Rust 后端，直接降级而不是抛异常
  if (!isTauri()) return { ok: false, error: NOT_AVAILABLE }
  try {
    const data = await invoke<T>(command, args)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: toArticleError(e) }
  }
}

export const articleApi = {
  /** 新建文章：写入 `<spacePath>/content/<slug>.mdx`。slug 重复会返回 ARTICLE_EXISTS 错误 */
  create: (input: CreateArticleInput): Promise<ArticleResult<CreateArticleData>> =>
    call<CreateArticleData>("article_create", {
      spacePath: input.spacePath,
      title: input.title,
      slug: input.slug,
    }),

  /** 列出空间下全部文章（遍历 content/*.mdx） */
  list: (spacePath: string): Promise<ArticleResult<ArticleListData>> =>
    call<ArticleListData>("article_list", { spacePath }),

  /** 删除文章：成功返回刷新后的列表 */
  remove: (spacePath: string, slug: string): Promise<ArticleResult<ArticleListData>> =>
    call<ArticleListData>("article_delete", { spacePath, slug }),

  /** 由标题生成 slug（后端用 rslug 转写汉字/符号）。结果空串时前端也能兜住 */
  slugify: (title: string): Promise<ArticleResult<ArticleSlugifyData>> =>
    call<ArticleSlugifyData>("article_slugify", { title }),
}

/**
 * 标题 → 合法文件名 slug 的高层封装：
 * 优先走 Tauri 后端（`rslug` 转写，汉字→拼音/ASCII）；
 * 非 Tauri 预览模式或后端返回空时，回退到本地 `slugify`。
 */
export async function generateArticleSlug(title: string): Promise<string> {
  const res = await articleApi.slugify(title.trim())
  if (res.ok && res.data.slug.length > 0) return res.data.slug
  return slugifyLocal(title) // 浏览器预览 / 兜底
}
