import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useLocation, useParams } from "wouter"
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { cn } from "cn"
import { MarkdownEditor } from "@/components/article/markdown-editor"
import { formatArticleDate } from "@/components/article/article-list-item"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { articleApi } from "@/lib/tauri/article-api"
import { useActiveSpace } from "@/stores/space-store"
import type { ArticleMeta, ArticleRecord } from "@/types/article"

/** 保存状态的可见反馈：状态文字 + 保存按钮图标 */
type SaveState = "idle" | "saving" | "saved" | "error"

/**
 * 文章编辑页——全屏极简布局（参考 Gridea Pro 写作页）：
 *  - 顶栏只在右侧放「返回 / 保存」两个图标按钮 + 一行保存状态文字
 *  - 正文一列居中（max-w-3xl），大标题 + 元信息行 + Monaco 编辑区
 *  - 页脚一行小字落款
 *
 * 刻意**不渲染侧边栏**（本路由挂在 AppLayout 之外）：写作时要的是
 * 一整块不受打扰的画布；返回列表靠顶栏的返回按钮。
 * 暂不做预览——Monaco 里直接写 Markdown 源文本。
 */
export function ArticleEditorPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug ?? ""
  const [, navigate] = useLocation()
  const activeSpace = useActiveSpace()
  const spaceId = activeSpace?.id ?? null

  const [record, setRecord] = useState<ArticleRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")

  /** 编辑中的正文与最近一次保存成功的正文——两者不同即「有未保存修改」 */
  const [body, setBody] = useState("")
  const [savedBody, setSavedBody] = useState("")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  // 用 ref 锁住「保存进行中」，避免 Ctrl+S 连击叠出并发写库
  const savingRef = useRef(false)

  useEffect(() => {
    if (!spaceId || !slug) return
    let cancelled = false
    setLoadState("loading")
    setLoadError(null)
    void articleApi.get(spaceId, slug).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setRecord(res.data)
        setBody(res.data.body)
        setSavedBody(res.data.body)
        setLoadState("ready")
      } else {
        setLoadError(res.error.message)
        setLoadState("error")
      }
    })
    return () => {
      cancelled = true
    }
  }, [spaceId, slug])

  const dirty = loadState === "ready" && body !== savedBody

  const save = useCallback(async () => {
    if (!spaceId || !slug || savingRef.current) return
    if (body === savedBody) return

    savingRef.current = true
    setSaveState("saving")
    setSaveError(null)
    try {
      const res = await articleApi.update({ spaceId, slug, body })
      if (res.ok) {
        setSavedBody(body)
        // 保存返回的元信息（size/updatedAt 已刷新）写回，保持页头与库一致
        setRecord((prev) => (prev ? { ...prev, article: res.data.article } : prev))
        setSaveState("saved")
      } else {
        setSaveState("error")
        setSaveError(res.error.message)
      }
    } finally {
      savingRef.current = false
    }
  }, [spaceId, slug, body, savedBody])

  // ===== 各状态渲染 =====

  if (!spaceId) {
    return (
      <CenterNotice
        icon={<FileTextIcon className="size-8 text-muted-foreground/60" />}
        title="未选择笔记空间"
        description="请先回到首页选择或新建一个空间。"
        onBack={() => navigate("/")}
      />
    )
  }

  if (loadState === "loading") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <LoaderCircleIcon className="size-5 animate-spin" />
        <p className="text-sm">正在打开文章…</p>
      </div>
    )
  }

  if (loadState === "error") {
    return (
      <CenterNotice
        icon={<FileTextIcon className="size-8 text-muted-foreground/60" />}
        title="文章打开失败"
        description={loadError ?? "未知错误"}
        onBack={() => history.back()}
      />
    )
  }

  // 守卫后 record 必然就绪；单独捕获以满足 TS 收窄
  const article: ArticleMeta = record!.article

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* 顶栏：右侧返回 + 保存（参考图同款布局），无侧边栏 */}
      <header className="flex h-12 shrink-0 items-center justify-end gap-1 px-3">
        <span
          aria-live="polite"
          className={cn(
            "mr-1 text-xs",
            saveState === "error" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {saveState === "saving"
            ? "保存中…"
            : saveState === "error"
              ? (saveError ?? "保存失败")
              : dirty
                ? "有未保存修改"
                : "已保存"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="返回列表"
          aria-label="返回列表"
          onClick={() => navigate("/articles")}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={dirty ? "保存（Ctrl+S）" : "没有需要保存的修改"}
          aria-label="保存"
          disabled={!dirty || saveState === "saving"}
          onClick={() => void save()}
        >
          {saveState === "saving" ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <CheckIcon
              className={cn("size-4", saveState === "saved" && "text-emerald-600")}
            />
          )}
        </Button>
      </header>

      {/* 正文一列：居中限宽，标题 + 元信息 + 编辑器 */}
      <main className="flex min-h-0 flex-1 justify-center">
        <div className="flex h-full w-full max-w-3xl flex-col px-6">
          <h1 className="text-2xl leading-9 font-semibold tracking-tight text-foreground">
            {article.title}
          </h1>

          <div className="mt-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  article.draft ? "bg-amber-500" : "bg-emerald-500"
                )}
              />
              {article.draft ? "草稿" : "已发布"}
            </span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              {formatArticleDate(article)}
            </span>
            {article.tags.length > 0 && (
              <>
                <span aria-hidden className="h-3 w-px bg-border" />
                <span className="flex flex-wrap items-center gap-1.5">
                  {article.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-muted-foreground">
                      {tag}
                    </Badge>
                  ))}
                </span>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <MarkdownEditor value={body} onChange={setBody} onSave={() => void save()} />
          </div>
        </div>
      </main>

      <footer className="shrink-0 py-3 text-center text-xs text-muted-foreground">
        写作于 wordma
      </footer>
    </div>
  )
}

/** 居中的提示块：无空间 / 加载失败时占满整页 */
function CenterNotice({
  icon,
  title,
  description,
  onBack,
}: {
  icon: ReactNode
  title: string
  description: string
  onBack: () => void
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
      {icon}
      <h1 className="text-lg font-medium">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeftIcon className="size-4" />
        返回
      </Button>
    </div>
  )
}
