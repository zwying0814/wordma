import { useRef, useState } from "react"
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

/**
 * 副标题：优先描述，其次创建时间。
 * 不再暴露路径——空间已经没有路径了。
 */
function formatSpaceSubtitle(space: {
  description: string
  createdAt: number
}): string {
  const desc = space.description.trim()
  if (desc) return desc
  const diffDays = Math.floor((Date.now() - space.createdAt) / 86_400_000)
  if (diffDays <= 0) return "今天创建"
  if (diffDays === 1) return "昨天创建"
  if (diffDays < 30) return `${diffDays} 天前创建`
  return `创建于 ${new Date(space.createdAt).toLocaleDateString("zh-CN")}`
}

/**
 * 管理空间。
 *
 * ⚠️ 删除语义已经和旧版**完全不同**：旧版是「从列表移除一条记录」，磁盘上的
 * 那个 `.db` 文件原封不动，想找回来再打开一次就行；现在所有空间的笔记都在同一个库里，
 * 删空间 = **连笔记一起销毁**，没有第二个副本。
 *
 * 所以这里做了两件事：把代价（多少篇）摊给用户看，并且**必须点两次**才真的删。
 */
export function ManageSpacesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const spaces = useSpaces()
  const actions = useSpaceActions()
  // 行内两阶段确认：点垃圾桶后该行原地变成「取消 / 删除」
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 只对「正在确认的那一行」缓存篇数，避免为整个列表做 N 次查询
  const [count, setCount] = useState<number | null>(null)
  // 用 ref 记住在等谁的数字：请求返回时用户可能已经切到别的行了
  const pendingCountFor = useRef<string | null>(null)

  async function startConfirm(id: string) {
    pendingCountFor.current = id
    setConfirmingId(id)
    setCount(null)
    // 先给用户即时反馈，再补上具体篇数
    const n = await actions.countArticles(id)
    if (pendingCountFor.current === id) setCount(n)
  }

  function cancelConfirm() {
    pendingCountFor.current = null
    setConfirmingId(null)
    setCount(null)
  }

  async function handleRemove(id: string) {
    setBusy(true)
    try {
      await actions.removeSpace(id)
      cancelConfirm()
    } finally {
      setBusy(false)
    }
  }

  /** 确认文案里的代价：篇数取不到时也要说清会发生什么 */
  function costText(): string {
    if (count === null) return "该空间下的全部笔记都会被删除"
    if (count === 0) return "该空间目前没有笔记"
    return `该空间下的 ${count} 篇笔记会一起被删除`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>管理空间</DialogTitle>
          <DialogDescription>
            删除空间会连同它里面的笔记一起删除，且无法撤销。
            想留底请先用「备份笔记库」。
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-80 min-w-0 gap-2 overflow-y-auto overflow-x-hidden">
          {spaces.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              暂无空间
            </p>
          ) : (
            spaces.map((space) => {
              const confirming = confirmingId === space.id
              return (
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
                    <p className="truncate text-xs text-muted-foreground">
                      {formatSpaceSubtitle(space)}
                    </p>
                  </div>

                  {confirming ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* 代价放在按钮旁边，用户点「删除」之前一定看得到 */}
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <TriangleAlertIcon className="size-3.5 shrink-0" />
                        {costText()}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={cancelConfirm}
                        disabled={busy}
                      >
                        取消
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => void handleRemove(space.id)}
                        disabled={busy}
                      >
                        删除
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`删除 ${space.name}`}
                      onClick={() => void startConfirm(space.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
