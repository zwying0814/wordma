import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

import { articleApi } from "@/lib/tauri/article-api"
import type {
  ArticleData,
  ArticleError,
  ArticleMeta,
  ArticleResult,
  CreateArticleInput,
} from "@/types/article"

/**
 * ⚠️ zustand v5 约定（v4 的默认浅比较已移除，selector 返回新对象会无限重渲染）：
 *  - action 内一律用 get() 读 state，绝不捕获外层变量
 *  - 组件里绝不用 `const { x, y } = useArticleStore()`（订阅整个 store）；
 *    逐字段 selector + 多字段一律 useShallow
 *
 * 文章是**库里 `articles` 表的一行**，靠 `spaceId` 归属（整个应用只有一个库）。
 * 列表为**服务端分页**：本 store 只持有当前页的数据 + total，翻页/变更后重新拉取当前页。
 */
export type ArticleStatus = "idle" | "loading" | "ready" | "error"

export type ArticleMutationResult =
  | { ok: true; data: ArticleData }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; error: ArticleError }

export const DEFAULT_PAGE_SIZE = 20

/** 可选每页条数（与后端 `MAX_PAGE_SIZE` 对齐，前端只给不超过上限的档位） */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

type ArticleState = {
  status: ArticleStatus
  /** 当前页的文章 */
  articles: ArticleMeta[]
  /** 当前空间文章总数（用于算总页数） */
  total: number
  /** 当前页码，1 起 */
  page: number
  pageSize: number
  /** 当前所属空间，翻页/变更后重取时用 */
  spaceId: string | null
  error: ArticleError | null
  /** 变更类操作进行中（新建/删除/置顶） */
  pending: boolean

  load: (spaceId: string, page?: number, pageSize?: number) => Promise<void>
  goToPage: (page: number) => Promise<void>
  setPageSize: (pageSize: number) => Promise<void>
  refresh: () => Promise<void>
  create: (input: CreateArticleInput) => Promise<ArticleMutationResult>
  remove: (slug: string) => Promise<ArticleResult<null>>
  setPinned: (slug: string, pinned: boolean) => Promise<ArticleResult<ArticleData>>
  /** 批量置顶/取消置顶：逐个写盘，最后只重取一次当前页 */
  bulkSetPinned: (slugs: string[], pinned: boolean) => Promise<ArticleError | null>
  /** 批量删除：逐个写盘，最后只重取一次当前页 */
  bulkRemove: (slugs: string[]) => Promise<ArticleError | null>
  clearError: () => void
}

const BUSY: ArticleError = { code: "UNKNOWN", message: "操作进行中，请稍候" }

/**
 * 请求序号：翻页/刷新可能并发，只接受最后一次请求的结果，
 * 避免快速点页码时旧响应后到把新页覆盖掉。
 */
let loadSeq = 0

export const useArticleStore = create<ArticleState>((set, get) => ({
  status: "idle",
  articles: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  spaceId: null,
  error: null,
  pending: false,

  load: async (spaceId, page, pageSize) => {
    const seq = ++loadSeq
    const prev = get()
    const size = pageSize ?? prev.pageSize
    const target = page ?? prev.page
    set({ status: "loading", spaceId })
    const res = await articleApi.page({ spaceId, page: target, pageSize: size })
    if (seq !== loadSeq) return // 已有更新的请求，丢弃本次结果
    if (res.ok) {
      set({
        status: "ready",
        articles: res.data.articles,
        total: res.data.total,
        // 以服务端夹取后的页码为准（越界请求会被拉回有效范围）
        page: res.data.page,
        pageSize: res.data.pageSize,
        error: null,
      })
      return
    }
    set({ status: "error", error: res.error })
  },

  goToPage: async (page) => {
    const { spaceId, pageSize } = get()
    if (!spaceId) return
    await get().load(spaceId, page, pageSize)
  },

  setPageSize: async (pageSize) => {
    const { spaceId } = get()
    if (!spaceId) return
    // 每页条数变化后回到第 1 页，避免落在越界页码上
    await get().load(spaceId, 1, pageSize)
  },

  refresh: async () => {
    const { spaceId, page, pageSize } = get()
    if (!spaceId) return
    await get().load(spaceId, page, pageSize)
  },

  create: async (input) => {
    if (get().pending) return { ok: false, reason: "error", error: BUSY }
    set({ pending: true })
    try {
      const res = await articleApi.create(input)
      if (res.ok) {
        // 新建后回到第 1 页：新文章按置顶/日期排序通常落在最前
        await get().load(input.spaceId, 1, get().pageSize)
        return { ok: true, data: res.data }
      }
      return { ok: false, reason: "error", error: res.error }
    } finally {
      set({ pending: false })
    }
  },

  remove: async (slug) => {
    const { spaceId, page, pageSize } = get()
    if (!spaceId) {
      return { ok: false, error: { code: "INVALID_PATH", message: "未选择笔记空间" } }
    }
    if (get().pending) return { ok: false, error: BUSY }
    set({ pending: true })
    try {
      const res = await articleApi.remove(spaceId, slug)
      if (res.ok) {
        // 删除会改变 total 与页码：重取当前页，越界时后端会把页码夹回上一页
        await get().load(spaceId, page, pageSize)
      } else {
        set({ error: res.error })
      }
      return res
    } finally {
      set({ pending: false })
    }
  },

  setPinned: async (slug, pinned) => {
    const { spaceId, page, pageSize } = get()
    if (!spaceId) {
      return { ok: false, error: { code: "INVALID_PATH", message: "未选择笔记空间" } }
    }
    if (get().pending) return { ok: false, error: BUSY }
    set({ pending: true })
    try {
      const res = await articleApi.setPinned({ spaceId, slug, pinned })
      if (res.ok) {
        // 置顶会改变排序位置，重取当前页即可看到效果
        await get().load(spaceId, page, pageSize)
      } else {
        set({ error: res.error })
      }
      return res
    } finally {
      set({ pending: false })
    }
  },

  clearError: () => set({ error: null }),

  // 批量操作用**逐个写盘 + 最后一次重取**：
  // 若每篇都走 setPinned/remove，会触发 N 次分页请求，既慢又会让列表闪动。
  bulkSetPinned: async (slugs, pinned) => {
    const { spaceId, page, pageSize, pending } = get()
    if (!spaceId) return { code: "INVALID_PATH", message: "未选择笔记空间" }
    if (pending || slugs.length === 0) return null
    set({ pending: true })
    try {
      for (const slug of slugs) {
        const res = await articleApi.setPinned({ spaceId, slug, pinned })
        if (!res.ok) {
          set({ error: res.error })
          return res.error
        }
      }
      await get().load(spaceId, page, pageSize)
      return null
    } finally {
      set({ pending: false })
    }
  },

  bulkRemove: async (slugs) => {
    const { spaceId, page, pageSize, pending } = get()
    if (!spaceId) return { code: "INVALID_PATH", message: "未选择笔记空间" }
    if (pending || slugs.length === 0) return null
    set({ pending: true })
    try {
      for (const slug of slugs) {
        const res = await articleApi.remove(spaceId, slug)
        if (!res.ok) {
          set({ error: res.error })
          // 中途失败也要重取：前面几篇已经删掉了，UI 必须与磁盘一致
          await get().load(spaceId, page, pageSize)
          return res.error
        }
      }
      await get().load(spaceId, page, pageSize)
      return null
    } finally {
      set({ pending: false })
    }
  },
}))

// ===== 选择器（组件一律用这些，避免订阅整个 store） =====
export const useArticleMetas = (): ArticleMeta[] => useArticleStore((s) => s.articles)
export const useArticleStatus = (): ArticleStatus => useArticleStore((s) => s.status)
export const useArticleTotal = (): number => useArticleStore((s) => s.total)
export const useArticlePage = (): number => useArticleStore((s) => s.page)
export const useArticlePageSize = (): number => useArticleStore((s) => s.pageSize)
export const useArticlePending = (): boolean => useArticleStore((s) => s.pending)
export const useArticleError = (): ArticleError | null => useArticleStore((s) => s.error)

// 返回新对象 → 必须用 useShallow 包裹 selector
export const useArticleActions = () =>
  useArticleStore(
    useShallow((s) => ({
      load: s.load,
      goToPage: s.goToPage,
      setPageSize: s.setPageSize,
      refresh: s.refresh,
      create: s.create,
      remove: s.remove,
      setPinned: s.setPinned,
      bulkSetPinned: s.bulkSetPinned,
      bulkRemove: s.bulkRemove,
      clearError: s.clearError,
    })),
  )
