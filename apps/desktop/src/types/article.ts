/**
 * ⚠️ 此文件是渲染层类型真理之源，与 Rust 侧 `src-tauri/src/article/model.rs` 互为镜像。
 * Rust 那边有 serde 强类型兜底，但两边的字段命名与错误码仍是一一对应的契约，
 * 改这里务必同步改 Rust 模型，反之亦然（Rust 用 `rename_all = "camelCase"` 对齐驼峰）。
 */

/**
 * 文章元信息（不含正文）。`(spaceId, slug)` 是唯一键——slug 只需在自己的空间内唯一。
 *
 * **没有 `path` 字段了**：文章已从「`<空间>/content/<slug>.mdx` 文件」改为
 * `articles` 表里的一行，一篇文章不再对应任何文件。需要落成文件走 `article_export` 单独导出。
 *
 * `date` / `tags` / `draft` / `pinned` 入库时由创建流程给出，字段缺失时取缺省值，不算错误。
 */
export type ArticleMeta = {
  slug: string // 空间内唯一
  title: string // 展示标题（缺省回退 slug）
  date: string | null // YYYY-MM-DD；null 时展示层回退 createdAt
  createdAt: number // epoch ms
  updatedAt: number // epoch ms
  size: number // 正文字节数
  tags: string[]
  draft: boolean // true 表示草稿（列表显示「草稿」）
  pinned: boolean // true 时列表置顶并渲染 TOP 角标
}

/** 单篇文章的完整内容（含正文）。打开编辑器时用。 */
export type ArticleRecord = {
  article: ArticleMeta
  body: string
}

/** 单个文章的返回（创建 / 置顶等改变单篇状态的命令） */
export type ArticleData = { article: ArticleMeta }

/**
 * 分页列表返回。
 * `page` 为**实际生效**的页码：请求越界时后端会夹到有效范围，前端以此为准回写状态。
 */
export type ArticlePageData = {
  articles: ArticleMeta[]
  total: number
  page: number
  pageSize: number
}

/** 字面量联合，不用 enum（erasableSyntaxOnly 禁用） */
export type ArticleErrorCode =
  | "INVALID_NAME"
  | "ARTICLE_EXISTS"
  | "INVALID_PATH"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "UNKNOWN"

export type ArticleError = { code: ArticleErrorCode; message: string }

/** 统一返回信封：命令在 Rust 侧返回 Err，由 bridge 还原成此结构（IPC 不保留 Error 子类） */
export type ArticleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ArticleError }

/**
 * 分页入参：页码从 1 开始。
 * `spaceId` 是空间记录的 id（`Space.id`）——空间是库里的一行，不再是文件路径。
 */
export type PageArticlesInput = {
  spaceId: string
  page: number
  pageSize: number
}

/**
 * 新建文章入参。
 * `tags` 允许为空数组；`date` 由前端给本地当天日期（`YYYY-MM-DD`），
 * 传 null 则不写 date（展示层回退创建时间）。
 */
export type CreateArticleInput = {
  spaceId: string
  title: string
  slug: string
  tags: string[]
  date: string | null
}

/** 置顶/取消置顶入参 */
export type SetPinnedInput = {
  spaceId: string
  slug: string
  pinned: boolean
}

/** 保存正文入参（编辑器「保存」）。只更新 body；FTS/size/updated_at 由后端一并刷新 */
export type UpdateArticleInput = {
  spaceId: string
  slug: string
  body: string
}

/** 全文检索入参，分页语义与列表一致 */
export type SearchArticlesInput = {
  spaceId: string
  query: string
  page: number
  pageSize: number
}
