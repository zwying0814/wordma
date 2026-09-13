import { useEffect, useState } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  MAX_ARTICLE_NAME_LENGTH,
  SLUG_CHARSET_HINT,
  sanitizeSlugInput,
  validateArticleSlug,
} from "@/lib/article-name"
import { generateArticleSlug, warmUpSlug } from "@/lib/slug"
import { useArticleActions, useArticlePending } from "@/stores/article-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CreateArticleDialog({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前空间 id（`Space.id`）——文章靠它归属，写进同库 `articles` 表的一行 */
  spaceId: string
}) {
  const actions = useArticleActions()
  const pending = useArticlePending()

  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [generatingSlug, setGeneratingSlug] = useState(false)
  // 中文输入法合成期间不干预输入框内容（否则会打断候选词输入），
  // 合成结束时再统一清洗。
  const [composing, setComposing] = useState(false)

  // 对话框一打开就预热 slug wasm（9.5MB，读盘+编译需数百毫秒）。
  // 用户填写标题的这几秒钟足够加载完，点按钮时基本是即时返回。
  useEffect(() => {
    if (open) warmUpSlug()
  }, [open])

  const trimmedTitle = title.trim()
  const trimmedSlug = slug.trim()
  const slugValidation =
    trimmedSlug.length > 0 ? validateArticleSlug(slug) : { ok: true as const }
  const slugError = slugValidation.ok ? null : slugValidation.message
  const titleError = trimmedTitle.length === 0 ? "文章标题不能为空" : null

  const canSubmit =
    trimmedTitle.length > 0 && trimmedSlug.length > 0 && slugValidation.ok && !pending

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      // 关闭：重置所有字段与提交错误，便于下次重新填写
      setTitle("")
      setSlug("")
      setTagsInput("")
      setSubmitError(null)
      setGeneratingSlug(false)
      setComposing(false)
    }
  }

  // 标题变化不再实时生成 slug；只有点击「根据标题生成」按钮时才生成
  function handleTitleChange(value: string) {
    setTitle(value)
  }

  // slug 输入：白名单外的字符直接丢弃（如空格、中文、全角符号）。
  // 输入法合成期间不管，避免打断候选词；合成结束再清洗一次。
  function handleSlugChange(value: string) {
    setSlug(composing ? value : sanitizeSlugInput(value))
  }

  function handleSlugCompositionEnd(value: string) {
    setComposing(false)
    setSlug(sanitizeSlugInput(value))
  }

  // 根据标题生成 slug（前端 wasm 包 @wordma/slug：rslug + 拼音转写），点击按钮才触发。
  // 加 generatingSlug 状态：即使 wasm 尚未就绪，也能给用户明确的「处理中」反馈，
  // 而不是看起来像卡住。
  async function handleGenerateFromTitle() {
    if (generatingSlug) return
    setGeneratingSlug(true)
    try {
      const s = await generateArticleSlug(title)
      // 兜底清洗：生成结果同样必须落在白名单内
      setSlug(sanitizeSlugInput(s))
    } finally {
      setGeneratingSlug(false)
    }
  }

  async function handleCreate() {
    if (!canSubmit) return
    setSubmitError(null)
    const result = await actions.create({
      spaceId,
      title: trimmedTitle,
      slug: trimmedSlug,
      tags: parseTags(tagsInput),
      // 日期用前端本地时间：后端拿不到本地时区，入库更准
      date: todayLocalDate(),
    })
    if (result.ok) {
      handleOpenChange(false)
      return
    }
    if (result.reason === "cancelled") {
      return
    }
    // 表单类与存储类错误都贴在对话框内（含「slug 已存在，禁止覆盖」）
    setSubmitError(result.error.message)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文章</DialogTitle>
          <DialogDescription>
            文章保存进当前空间的笔记库。slug 是它在空间内的唯一标识（同一空间内不可重复），
            标题与正文一并入库；需要文件时随时可导出为 MDX。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="article-title" className="text-sm font-medium">
              文章标题
            </label>
            <Input
              id="article-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="例如：我的第一篇文章"
              autoFocus
              aria-invalid={titleError ? true : undefined}
              className={cn(titleError && "border-destructive")}
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          <div className="grid gap-2">
            <label htmlFor="article-slug" className="text-sm font-medium">
              自定义 Slug（文件名）
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="article-slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={(e) => handleSlugCompositionEnd(e.currentTarget.value)}
                placeholder="例如：my-first-article"
                maxLength={MAX_ARTICLE_NAME_LENGTH}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={slugError ? true : undefined}
                className={cn(slugError && "border-destructive")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateFromTitle}
                disabled={trimmedTitle.length === 0 || generatingSlug}
                title="根据标题生成 slug"
              >
                {generatingSlug && <LoaderCircleIcon className="animate-spin" />}
                {generatingSlug ? "生成中…" : "根据标题生成"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {SLUG_CHARSET_HINT}；导出时将保存为{" "}
              <code className="text-foreground">{slug || "slug"}.mdx</code>
            </p>
            {slugError && <p className="text-xs text-destructive">{slugError}</p>}
          </div>

          <div className="grid gap-2">
            <label htmlFor="article-tags" className="text-sm font-medium">
              标签
              <span className="ml-1 font-normal text-muted-foreground">（可选）</span>
            </label>
            <Input
              id="article-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：Gridea Pro, 入门"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              用逗号或空格分隔，最多 10 个。
            </p>
          </div>

          {submitError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button type="button" onClick={handleCreate} disabled={!canSubmit}>
            {pending ? "创建中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 解析标签输入框：逗号（中英文）或空白分隔，去空、去重（大小写不敏感），
 * 上限与后端 `MAX_TAGS` 对齐。后端还会再规范化一次——永不信任前端。
 */
function parseTags(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(/[,，\s]+/)) {
    const tag = raw.trim()
    if (tag.length === 0) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 10) break
  }
  return out
}

/** 今天（本地时区）格式化为 `YYYY-MM-DD`，作为文章日期入库。 */
function todayLocalDate(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}
