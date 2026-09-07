import { TagsIcon } from "lucide-react"

export function TagsPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <TagsIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">标签</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        页面占位，后续将在此展示标签管理与关联功能。
      </p>
    </div>
  )
}
