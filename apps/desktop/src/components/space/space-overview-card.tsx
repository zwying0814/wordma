import { FolderOpenIcon } from "lucide-react"

import { SpaceIcon } from "@/components/space/space-icon"
import { useActiveSpace, useSpaceActions } from "@/stores/space-store"
import { Button } from "@/components/ui/button"

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString()
  } catch {
    return ""
  }
}

/** 文章页顶部的当前空间信息卡 */
export function SpaceOverviewCard() {
  const activeSpace = useActiveSpace()
  const actions = useSpaceActions()

  if (!activeSpace) return null

  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <SpaceIcon name={activeSpace.icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{activeSpace.name}</p>
        <p
          className="truncate font-mono text-xs text-muted-foreground"
          title={activeSpace.path}
        >
          {activeSpace.path}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          创建于 {formatDate(activeSpace.createdAt)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void actions.reveal(activeSpace.id)}
        disabled={!activeSpace.exists}
      >
        <FolderOpenIcon className="size-4" />
        在文件管理器中打开
      </Button>
    </div>
  )
}
