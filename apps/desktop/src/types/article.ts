/**
 * ⚠️ 此文件是渲染层类型真理之源，与 Rust 侧 `src-tauri/src/article/model.rs` 互为镜像。
 * Rust 那边有 serde 强类型兜底，但两边的字段命名与错误码仍是一一对应的契约，
 * 改这里务必同步改 Rust 模型，反之亦然（Rust 用 `rename_all = "camelCase"` 对齐驼峰）。
 */

/** 文章元信息（不含正文）。`slug` 为文件名（去扩展名）也是唯一键；`title` 为展示标题 */
export type ArticleMeta = {
  slug: string // 文件名（不含 .mdx），唯一键
  title: string // 展示标题（取自 frontmatter，缺省回退 slug）
  path: string // 绝对路径（含 .mdx）
  createdAt: number // epoch ms（文件修改时间）
  size: number // 字节数
}

export type CreateArticleData = { article: ArticleMeta }
export type ArticleListData = { articles: ArticleMeta[] }

/** 由标题生成 slug 的返回（后端用 rslug 转写，汉字/符号转 ASCII） */
export type ArticleSlugifyData = { slug: string }

/** 字面量联合，不用 enum（erasableSyntaxOnly 禁用） */
export type ArticleErrorCode =
  | "INVALID_NAME"
  | "ARTICLE_EXISTS"
  | "INVALID_PATH"
  | "NOT_A_DIRECTORY"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "UNKNOWN"

export type ArticleError = { code: ArticleErrorCode; message: string }

/** 统一返回信封：命令在 Rust 侧返回 Err，由 bridge 还原成此结构（IPC 不保留 Error 子类） */
export type ArticleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ArticleError }

/** 新建文章入参：当前空间绝对路径 + 文章标题（frontmatter）+ 自定义 slug（文件名） */
export type CreateArticleInput = { spacePath: string; title: string; slug: string }
