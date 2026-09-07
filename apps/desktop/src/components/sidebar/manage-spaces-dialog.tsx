import { useState } from "react"
import { Trash2Icon, TriangleAlertIcon } from "lucide-react"

import { SpaceIcon } from "@/components/space/space-icon"
import { useSpaceActions, useSpaces } from "@/stores/space-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** 副标题：优先描述，其次创建时间；失效空间直接提示「不可用」（不再暴露路径） */
function formatSpaceSubtitle(space: {
  exists: boolean
  description: string
  createdAt: number
}): string {
  if (!space.exists) return "空间不可用"
  const desc = space.description.trim()
  if (desc) return desc
  const diffDays = Math.floor((Date.now() - space.createdAt) / 86_400_000)
  if (diffDays <= 0) return "今天创建"
  if (diffDays === 1) return "昨天创建"
  if (diffDays < 30) return `${diffDays} 天前创建`
  return `创建于 ${new Date(space.createdAt).toLocaleDateString("zh-CN")}`
}

export function ManageSpacesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const spaces = useSpaces()
  const actions = useSpaceActions()
  // 行内两阶段确认：点垃圾桶后该行原地变成「移除？ [取消] [移除]」
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function handleRemove(id: string) {
    await actions.removeSpace(id)
    setConfirmingId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>管理空间</DialogTitle>
          <DialogDescription>
            移除只会从列表里删除这条记录，不会删除空间里的任何内容。
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-80 min-w-0 gap-2 overflow-y-auto overflow-x-hidden">
          {spaces.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无空间
            </p>
          ) : (
            spaces.map((space) => (
              <div
                key={space.id}
                className="flex min-w-0 items-center gap-3 rounded-md border p-2"
              >
                <SpaceIcon
                  name={space.icon}
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{space.name}</p>
                  <p
                    className={
                      space.exists
                        ? "truncate text-xs text-muted-foreground"
                        : "flex items-center gap-1 truncate text-xs text-destructive"
                    }
                  >
                    {!space.exists && (
                      <TriangleAlertIcon className="size-3.5 shrink-0" />
                    )}
                    {formatSpaceSubtitle(space)}
                  </p>
                </div>

                {confirmingId === space.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setConfirmingId(null)}
                    >
                      取消
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => void handleRemove(space.id)}
                    >
                      移除
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`移除 ${space.name}`}
                    onClick={() => setConfirmingId(space.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
