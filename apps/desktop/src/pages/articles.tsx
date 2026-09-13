import { useEffect, useMemo, useState } from "react"
import { useLocation } from "wouter"
import {
  FileTextIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  XIcon,
} from "lucide-react"

import { cn } from "cn"
import { useActiveSpace } from "@/stores/space-store"
import {
  PAGE_SIZE_OPTIONS,
  useArticleActions,
  useArticleMetas,
  useArticlePage,
  useArticlePageSize,
  useArticlePending,
  useArticleStatus,
  useArticleTotal,
} from "@/stores/article-store"
import { ArticleListItem } from "@/components/article/article-list-item"
import { CreateArticleDialog } from "@/components/article/create-article-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

/**
 * 页码窗口：始终显示首/末页与当前页 ±1，中间用省略号折叠。
 * 文章上万时（数百页）不能把所有页码都渲染出来。
 */
function pageWindow(current: number, totalPages: number): (number | "gap")[] {
  const wanted = [1, current - 1, current, current + 1, totalPages].filter(
    (n) => n >= 1 && n <= totalPages
  )
  const uniq = Array.from(new Set(wanted)).sort((a, b) => a - b)
  const out: (number | "gap")[] = []
  let prev = 0
  for (const n of uniq) {
    if (n - prev > 1) out.push("gap")
    out.push(n)
    prev = n
  }
  return out
}

function ArticleListSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="gap-0 py-3.5 pr-2.5 pl-4">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-1 size-4 rounded-[4px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function ArticlesPage() {
  const activeSpace = useActiveSpace()
  const articles = useArticleMetas()
  const status = useArticleStatus()
  const total = useArticleTotal()
  const page = useArticlePage()
  const pageSize = useArticlePageSize()
  const pending = useArticlePending()
  const actions = useArticleActions()
  const [, navigate] = useLocation()

  const [createOpen, setCreateOpen] = useState(false)
  /** 当前页选中的 slug（翻页会清空：跨页批量选择在服务端分页下语义含糊） */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** 待确认删除的 slug 列表（单个/批量共用） */
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)

  const spaceId = activeSpace?.id ?? null

  // 空间切换或首次进入时拉第一页
  useEffect(() => {
    if (spaceId) void actions.load(spaceId, 1)
  }, [spaceId, actions])

  useEffect(() => {
    setSelected(new Set())
  }, [page, spaceId])

  // 列表变化（删除/翻页）后，丢掉已经不在列表里的选中项，避免"幽灵选中"
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(articles.map((a) => a.slug))
      const next = new Set([...prev].filter((slug) => visible.has(slug)))
      return next.size === prev.size ? prev : next
    })
  }, [articles])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const window = useMemo(() => pageWindow(page, totalPages), [page, totalPages])
  const selectedArticles = useMemo(
    () => articles.filter((a) => selected.has(a.slug)),
    [articles, selected]
  )

  if (!spaceId) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <FileTextIcon className="size-10 text-muted-foreground/60" />
        <h1 className="text-lg font-medium">文章</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          请先在侧边栏选择一个笔记空间，再创建文章。
        </p>
      </div>
    )
  }

  // 守卫之后 spaceId 已确定非空；闭包内 TS 不会保留收窄，单独捕获成 string
  const currentSpaceId: string = spaceId
  // 文章存在同一个库里、按空间归属，所以这里展示空间名而不是任何路径
  const spaceName = activeSpace?.name ?? "当前空间"

  function toggleSelect(slug: string, next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev)
      if (next) copy.add(slug)
      else copy.delete(slug)
      return copy
    })
  }

  function toggleAllOnPage(next: boolean) {
    setSelected(next ? new Set(articles.map((a) => a.slug)) : new Set())
  }

  async function handleBulkPin(pinned: boolean) {
    const targets = selectedArticles
      .filter((a) => a.pinned !== pinned)
      .map((a) => a.slug)
    if (targets.length === 0) {
      setSelected(new Set())
      return
    }
    await actions.bulkSetPinned(targets, pinned)
    setSelected(new Set())
  }

  async function confirmDelete() {
    const targets = pendingDelete
    setPendingDelete(null)
    if (!targets || targets.length === 0) return
    await actions.bulkRemove(targets)
    setSelected(new Set())
  }

  const allOnPageSelected =
    articles.length > 0 && articles.every((a) => selected.has(a.slug))

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-medium">文章</h1>
          <p className="truncate text-sm text-muted-foreground" title={spaceName}>
            {status === "ready" ? `共 ${total} 篇` : "加载中…"} · 属于空间「{spaceName}」
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            title="刷新列表"
            aria-label="刷新列表"
            disabled={status === "loading"}
            onClick={() => void actions.refresh()}
          >
            <RefreshCwIcon
              className={cn("size-4", status === "loading" && "animate-spin")}
            />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            新建文章
          </Button>
        </div>
      </div>

      {/* 工具栏：有选中项时替换成批量操作条 */}
      {articles.length > 0 && (
        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
          {selected.size === 0 ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button
                variant="outline"
                size="xs"
                onClick={() => toggleAllOnPage(!allOnPageSelected)}
              >
                {allOnPageSelected ? "取消全选" : "全选本页"}
              </Button>
              勾选后可批量置顶或删除
            </label>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                已选 {selected.size} 篇
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void handleBulkPin(true)}
                >
                  <PinIcon className="size-3.5" />
                  置顶
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void handleBulkPin(false)}
                >
                  <PinOffIcon className="size-3.5" />
                  取消置顶
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={pending}
                  onClick={() => setPendingDelete(selectedArticles.map((a) => a.slug))}
                >
                  <TrashIcon className="size-3.5" />
                  删除
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="取消选择"
                  aria-label="取消选择"
                  onClick={() => setSelected(new Set())}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {status === "loading" && articles.length === 0 && <ArticleListSkeleton />}

      {status === "ready" && total === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
          <FileTextIcon className="size-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            还没有文章，点击「新建文章」创建第一篇。
          </p>
        </div>
      )}

      {articles.length > 0 && (
        <div className="grid gap-3">
          {articles.map((article) => (
            <ArticleListItem
              key={article.slug}
              article={article}
              selected={selected.has(article.slug)}
              disabled={pending}
              onOpen={() => navigate(`/article/${article.slug}`)}
              onToggleSelect={(next) => toggleSelect(article.slug, next)}
              onTogglePinned={(pinned) => void actions.setPinned(article.slug, pinned)}
              onRequestDelete={() => setPendingDelete([article.slug])}
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <Card className="items-center gap-2 py-8 text-center">
          <p className="text-sm text-destructive">文章列表加载失败。</p>
          <Button variant="outline" size="sm" onClick={() => void actions.refresh()}>
            重试
          </Button>
        </Card>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              共 {total} 篇 · 第 {page}/{totalPages} 页
            </span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <label className="flex items-center gap-1.5">
              每页
              <select
                value={pageSize}
                disabled={pending}
                onChange={(e) => void actions.setPageSize(Number(e.target.value))}
                className="h-6 rounded-md border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              篇
            </label>
          </div>

          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  disabled={page <= 1 || pending}
                  onClick={() => void actions.goToPage(page - 1)}
                />
              </PaginationItem>

              {window.map((slot, i) =>
                slot === "gap" ? (
                  <PaginationItem key={`gap-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={slot}>
                    <PaginationLink
                      isActive={slot === page}
                      disabled={pending}
                      onClick={() => void actions.goToPage(slot)}
                    >
                      {slot}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  disabled={page >= totalPages || pending}
                  onClick={() => void actions.goToPage(page + 1)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <CreateArticleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        spaceId={currentSpaceId}
      />

      {/* 删除确认：删除会连正文一起从笔记库里抹掉，不可撤销，必须显式确认 */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              删除{pendingDelete && pendingDelete.length > 1 ? ` ${pendingDelete.length} 篇` : ""}
              文章
            </DialogTitle>
            <DialogDescription>
              将从笔记库中删除以下文章（含正文），此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 overflow-auto rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {(pendingDelete ?? []).map((slug) => (
              <li key={slug} className="truncate font-mono">
                {slug}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void confirmDelete()}
            >
              {pending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
