import { useState } from "react"

import { cn } from "@/lib/utils"
import { validateArticleSlug } from "@/lib/article-name"
import { generateArticleSlug } from "@/lib/tauri/article-api"
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
  spacePath,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前空间绝对路径，文章将写入其 content 子目录 */
  spacePath: string
}) {
  const actions = useArticleActions()
  const pending = useArticlePending()

  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)

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
      setSubmitError(null)
    }
  }

  // 标题变化不再实时生成 slug；只有点击「根据标题生成」按钮时才生成
  function handleTitleChange(value: string) {
    setTitle(value)
  }

  // 根据标题生成 slug（经后端 rslug 转写汉字/符号），点击按钮才触发
  async function handleGenerateFromTitle() {
    const s = await generateArticleSlug(title)
    setSlug(s)
  }

  async function handleCreate() {
    if (!canSubmit) return
    setSubmitError(null)
    const result = await actions.create({
      spacePath,
      title: trimmedTitle,
      slug: trimmedSlug,
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
            文章以 MDX 格式保存到当前空间的 content 目录下。标题写入 frontmatter，
            自定义 slug 作为文件名，slug 必须唯一。
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
                onChange={(e) => setSlug(e.target.value)}
                placeholder="例如：my-first-article"
                aria-invalid={slugError ? true : undefined}
                className={cn(slugError && "border-destructive")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateFromTitle}
                disabled={trimmedTitle.length === 0}
                title="根据标题用 rslug 生成"
              >
                根据标题生成
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              文件将保存为 <code className="text-foreground">{slug || "slug"}.mdx</code>
              ；可手动改成任意合法文件名。
            </p>
            {slugError && <p className="text-xs text-destructive">{slugError}</p>}
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
