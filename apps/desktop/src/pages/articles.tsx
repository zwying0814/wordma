import { FileTextIcon } from "lucide-react"

export function ArticlesPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <FileTextIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">文章</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        页面占位，后续将在此展示文章列表与管理功能。
      </p>
    </div>
  )
}
