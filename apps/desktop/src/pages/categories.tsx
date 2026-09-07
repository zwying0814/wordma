import { FolderTreeIcon } from "lucide-react"

export function CategoriesPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <FolderTreeIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">分类</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        页面占位，后续将在此展示分类树与管理功能。
      </p>
    </div>
  )
}
