import { TriangleAlertIcon } from "lucide-react"

import { useActiveSpace, useSpaceActions } from "@/stores/space-store"
import { Button } from "@/components/ui/button"

/** 当前激活空间的目录被外部删除/失效时，在内容区顶部提示，并提供移除入口 */
export function SpaceMissingBanner() {
  const activeSpace = useActiveSpace()
  const actions = useSpaceActions()

  if (!activeSpace || activeSpace.exists) return null

  return (
    <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <TriangleAlertIcon className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">空间「{activeSpace.name}」的目录已失效</p>
        <p className="truncate text-xs" title={activeSpace.path}>
          {activeSpace.path}
        </p>
      </div>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => void actions.removeSpace(activeSpace.id)}
      >
        从列表移除
      </Button>
    </div>
  )
}
