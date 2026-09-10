import { useEffect, useState } from "react"
import { FileTextIcon, PlusIcon, TrashIcon } from "lucide-react"

import { useActiveSpace } from "@/stores/space-store"
import {
  useArticleActions,
  useArticleMetas,
  useArticleStatus,
} from "@/stores/article-store"
import { CreateArticleDialog } from "@/components/article/create-article-dialog"
import { Button } from "@/components/ui/button"

export function ArticlesPage() {
  const activeSpace = useActiveSpace()
  const articles = useArticleMetas()
  const status = useArticleStatus()
  const actions = useArticleActions()
  const [createOpen, setCreateOpen] = useState(false)

  const spacePath = activeSpace?.path ?? null

  // 空间切换或首次进入时刷新文章列表（action 引用永久稳定，依赖 spacePath）
  useEffect(() => {
    if (spacePath) void actions.list(spacePath)
  }, [spacePath, actions])

  if (!spacePath) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <FileTextIcon className="size-10 text-muted-foreground/60" />
        <h1 className="text-lg font-medium">文章</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          请先在侧边栏选择或打开一个笔记空间，再创建文章。
        </p>
      </div>
    )
  }

  // 守卫之后 spacePath 已确定非空；闭包内 TS 不会保留收窄，单独捕获成 string
  const currentSpacePath: string = spacePath

  function handleDelete(slug: string) {
    void actions.remove(currentSpacePath, slug)
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">文章</h1>
          <p className="text-sm text-muted-foreground">
            保存在 {spacePath}/content
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          新建文章
        </Button>
      </div>

      {status === "loading" && (
        <p className="text-sm text-muted-foreground">加载中…</p>
      )}

      {status === "ready" && articles.length === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
          <FileTextIcon className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            还没有文章，点击「新建文章」创建第一篇 MDX。
          </p>
        </div>
      )}

      {status === "ready" && articles.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {articles.map((article) => (
            <li
              key={article.slug}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground/70" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{article.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {article.slug}.mdx · {article.size} 字节
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`删除 ${article.title}`}
                onClick={() => handleDelete(article.slug)}
              >
                <TrashIcon className="size-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {status === "error" && (
        <p className="text-sm text-destructive">文章列表加载失败，请重试。</p>
      )}

      <CreateArticleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        spacePath={currentSpacePath}
      />
    </div>
  )
}
