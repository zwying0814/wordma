import { invoke, isTauri } from "@tauri-apps/api/core"

import type {
  ArticleData,
  ArticleError,
  ArticlePageData,
  ArticleRecord,
  ArticleResult,
  CreateArticleInput,
  PageArticlesInput,
  SearchArticlesInput,
  SetPinnedInput,
  UpdateArticleInput,
} from "@/types/article"

/**
 * Tauri 侧文章能力的唯一出口。
 *
 * 设计要点：
 *  - 业务命令一律走 `invoke` 调 Rust（`src-tauri/src/article/commands.rs`），
 *    命令名 `article_*`；参数由 Tauri 自动做驼峰转换（`spaceId` → `space_id`）。
 *  - **命令绝不 reject**：Rust 的 `Err(ArticleError)` 被还原成 `{ ok:false, error }`，
 *    与 space 模块保持同一套信封语义，store / 组件层无需感知底层。
 *  - `spaceId` 是**空间记录的 id**（`Space.id`）。整个应用只有一个库，
 *    文章靠 `space_id` 归属，所以不再有「空间文件路径」这种东西。
 *  - 列表是**服务端分页**：只取当前页，`total` 用于算总页数。
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
  /**
   * 分页取文章：置顶优先 → 日期倒序 → slug 升序。
   * 排序与分页由 SQL 完成，不再有「重新扫描目录」这回事。
   */
  page: (input: PageArticlesInput): Promise<ArticleResult<ArticlePageData>> =>
    call<ArticlePageData>("article_page", {
      spaceId: input.spaceId,
      page: input.page,
      pageSize: input.pageSize,
    }),

  /**
   * 全文检索，分页语义与 `page` 完全一致，可直接复用列表 UI。
   *
   * ⚠️ 索引用的是 trigram 分词器（为中文选的），**少于 3 个字符的词检索不到**：
   * 搜「锂电池」有效，搜「电池」无效。短词由后端退回 `LIKE` 兜底。
   */
  search: (input: SearchArticlesInput): Promise<ArticleResult<ArticlePageData>> =>
    call<ArticlePageData>("article_search", {
      spaceId: input.spaceId,
      query: input.query,
      page: input.page,
      pageSize: input.pageSize,
    }),

  /** 取单篇（含正文）。打开编辑器时用 */
  get: (spaceId: string, slug: string): Promise<ArticleResult<ArticleRecord>> =>
    call<ArticleRecord>("article_get", { spaceId, slug }),

  /** 新建文章：往 `articles` 表插一行。本空间内 slug 重复会返回 ARTICLE_EXISTS */
  create: (input: CreateArticleInput): Promise<ArticleResult<ArticleData>> =>
    call<ArticleData>("article_create", {
      spaceId: input.spaceId,
      title: input.title,
      slug: input.slug,
      tags: input.tags,
      date: input.date,
    }),

  /** 保存正文（编辑器「保存」）。只更新 body；索引与时间戳由后端一并刷新 */
  update: (input: UpdateArticleInput): Promise<ArticleResult<ArticleData>> =>
    call<ArticleData>("article_update", {
      spaceId: input.spaceId,
      slug: input.slug,
      body: input.body,
    }),

  /** 置顶/取消置顶 */
  setPinned: (input: SetPinnedInput): Promise<ArticleResult<ArticleData>> =>
    call<ArticleData>("article_set_pinned", {
      spaceId: input.spaceId,
      slug: input.slug,
      pinned: input.pinned,
    }),

  /** 删除文章。删除会改变 total/页码，调用方应重新拉取当前页 */
  remove: (spaceId: string, slug: string): Promise<ArticleResult<null>> =>
    call<null>("article_delete", { spaceId, slug }),

  /**
   * 把一篇文章导出成 `.mdx` 文件，返回写出的绝对路径。
   * 这是数据库化之后把内容落回文件系统的唯一出口。
   */
  export: (
    spaceId: string,
    slug: string,
    destDir: string,
  ): Promise<ArticleResult<string>> =>
    call<string>("article_export", { spaceId, slug, destDir }),
}
