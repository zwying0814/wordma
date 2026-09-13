import { useState } from "react"
import {
  FolderOpenIcon,
  MonitorIcon,
  PlusIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useSpaceActions, useSpaceError } from "@/stores/space-store"
import { CreateSpaceDialog } from "@/components/sidebar/create-space-dialog"
import { Button } from "@/components/ui/button"

/** 浏览器预览模式：无原生能力，引导去桌面端 */
export function BrowserModeNotice() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <MonitorIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">浏览器预览模式</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        笔记库是一个本地数据库文件，依赖桌面端的文件读写能力。请在桌面应用中使用「新建空间」。
      </p>
    </div>
  )
}

/** 本地存储不可用：错误态 + 重试 */
export function SpaceErrorState() {
  const actions = useSpaceActions()
  const error = useSpaceError()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <TriangleAlertIcon className="size-10 text-destructive/70" />
      <h1 className="text-lg font-medium">空间加载失败</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error ? error.message : "本地存储不可用，无法读取空间列表。"}
      </p>
      <Button variant="outline" onClick={() => void actions.refresh()}>
        <RotateCcwIcon className="size-4" />
        重试
      </Button>
    </div>
  )
}

/** 无空间引导页 */
export function EmptySpaceState() {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <FolderOpenIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">还没有笔记空间</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        所有空间都存在同一个笔记库里，新建一个空间即可开始。
      </p>
      <div className="flex gap-2">
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          新建空间
        </Button>
      </div>
      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
