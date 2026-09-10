import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"

import { articleApi } from "@/lib/tauri/article-api"
import type {
  ArticleError,
  ArticleListData,
  ArticleMeta,
  ArticleResult,
  CreateArticleData,
} from "@/types/article"

/**
 * ⚠️ zustand v5 约定（v4 的默认浅比较已移除，selector 返回新对象会无限重渲染）：
 *  - action 内一律用 get() 读 state，绝不捕获外层变量
 *  - 组件里绝不用 `const { x, y } = useArticleStore()`（订阅整个 store）；
 *    逐字段 selector + 多字段一律 useShallow
 *
 * 文章是「当前空间 content 目录下的 .mdx 文件」，列表来自磁盘。本 store 只缓存
 * 当前空间的文章，空间切换时由页面重新 `list(spacePath)` 刷新。
 */
export type ArticleStatus = "idle" | "loading" | "ready" | "error"

export type ArticleMutationResult =
  | { ok: true; data: CreateArticleData }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; error: ArticleError }

type ArticleState = {
  status: ArticleStatus
  articles: ArticleMeta[]
  error: ArticleError | null
  pending: boolean

  list: (spacePath: string) => Promise<void>
  create: (input: {
    spacePath: string
    title: string
    slug: string
  }) => Promise<ArticleMutationResult>
  remove: (spacePath: string, slug: string) => Promise<ArticleResult<ArticleListData>>
  clearError: () => void
}

const BUSY: ArticleError = { code: "UNKNOWN", message: "操作进行中，请稍候" }

export const useArticleStore = create<ArticleState>((set, get) => ({
  status: "idle",
  articles: [],
  error: null,
  pending: false,

  list: async (spacePath) => {
    set({ status: "loading" })
    const res = await articleApi.list(spacePath)
    if (res.ok) {
      set({ status: "ready", articles: res.data.articles, error: null })
      return
    }
    set({ status: "error", error: res.error })
  },

  create: async (input) => {
    if (get().pending) return { ok: false, reason: "error", error: BUSY }
    set({ pending: true })
    try {
      const res = await articleApi.create(input)
      if (res.ok) {
        // 创建成功后刷新列表，保持 UI 与磁盘一致
        await get().list(input.spacePath)
        return { ok: true, data: res.data }
      }
      return { ok: false, reason: "error", error: res.error }
    } finally {
      set({ pending: false })
    }
  },

  remove: async (spacePath, name) => {
    const res = await articleApi.remove(spacePath, name)
    if (res.ok) {
      set({ articles: res.data.articles, status: "ready", error: null })
    } else {
      set({ error: res.error })
    }
    return res
  },

  clearError: () => set({ error: null }),
}))

// ===== 选择器（组件一律用这些，避免订阅整个 store） =====
export const useArticleMetas = (): ArticleMeta[] => useArticleStore((s) => s.articles)
export const useArticleStatus = (): ArticleStatus => useArticleStore((s) => s.status)
export const useArticlePending = (): boolean => useArticleStore((s) => s.pending)
export const useArticleError = (): ArticleError | null => useArticleStore((s) => s.error)

// 返回新对象 → 必须用 useShallow 包裹 selector
export const useArticleActions = () =>
  useArticleStore(
    useShallow((s) => ({
      list: s.list,
      create: s.create,
      remove: s.remove,
      clearError: s.clearError,
    })),
  )
