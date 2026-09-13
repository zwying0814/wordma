import { CalendarIcon, PinIcon, PinOffIcon, TrashIcon } from "lucide-react"

import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import type { ArticleMeta } from "@/types/article"

/**
 * 列表项的展示日期：优先文章自己的 `date` 字段（入库时给出）；
 * 缺省时用创建时间在**本地时区**格式化（后端只存 epoch ms，避免时区偏移）。
 */
export function formatArticleDate(article: ArticleMeta): string {
  if (article.date) return article.date
  const d = new Date(article.createdAt)
  if (Number.isNaN(d.getTime())) return "—"
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * 左上角「TOP」斜角标：点击即取消置顶。
 *
 * 几何说明：外层是贴着卡片左上角的方形裁切区（`overflow-hidden`），
 * 内层长条以中心为原点旋转 -45°，使其中线正好落在 `x + y = 26` 上——
 * 于是斜带横跨左上角且离角顶点留出一小段空隙，与参考图一致。
 */
function TopRibbon({ onUnpin }: { onUnpin: () => void }) {
  return (
    <button
      type="button"
      onClick={onUnpin}
      title="取消置顶"
      aria-label="取消置顶"
      className="absolute top-0 left-0 z-10 size-14 cursor-pointer overflow-hidden rounded-tl-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="absolute top-[13px] left-[13px] w-[120px] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-neutral-900 py-[3px] text-center text-[9px] font-semibold tracking-[0.18em] text-white uppercase transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900">
        TOP
      </span>
    </button>
  )
}

export function ArticleListItem({
  article,
  selected,
  disabled,
  onOpen,
  onToggleSelect,
  onTogglePinned,
  onRequestDelete,
}: {
  article: ArticleMeta
  selected: boolean
  disabled: boolean
  /** 点击标题打开编辑器 */
  onOpen: () => void
  onToggleSelect: (selected: boolean) => void
  onTogglePinned: (pinned: boolean) => void
  onRequestDelete: () => void
}) {
  return (
    <Card
      className={cn(
        // gap-0 + 自定义内边距：卡片默认带 gap-1，列表项里不需要
        "group gap-0 overflow-hidden border-border/70 py-3.5 pr-2.5 pl-4 transition-colors",
        selected ? "border-ring/60 bg-muted/40" : "hover:border-border"
      )}
    >
      {article.pinned && <TopRibbon onUnpin={() => onTogglePinned(false)} />}

      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={selected}
          disabled={disabled}
          onCheckedChange={(checked) => onToggleSelect(checked)}
          aria-label={`选择「${article.title}」`}
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            title="点击编辑"
            className="block w-full truncate text-left text-[15px] leading-6 font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {article.title}
          </button>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {/* 状态：已发布 / 草稿 */}
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
        </div>

        {/* 悬停/键盘聚焦时才浮现的操作区，保持列表视觉干净 */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            title={article.pinned ? "取消置顶" : "置顶"}
            aria-label={article.pinned ? "取消置顶" : "置顶"}
            onClick={() => onTogglePinned(!article.pinned)}
          >
            {article.pinned ? (
              <PinOffIcon className="size-4 text-muted-foreground" />
            ) : (
              <PinIcon className="size-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            title="删除"
            aria-label={`删除「${article.title}」`}
            onClick={onRequestDelete}
          >
            <TrashIcon className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
