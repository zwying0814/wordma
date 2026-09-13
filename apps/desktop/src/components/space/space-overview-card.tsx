import { useState } from "react"
import { DatabaseBackupIcon, FolderOpenIcon } from "lucide-react"

import { SpaceIcon } from "@/components/space/space-icon"
import { useActiveSpace, useDbPath, useSpaceActions } from "@/stores/space-store"
import { Button } from "@/components/ui/button"

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString()
  } catch {
    return ""
  }
}

/**
 * 文章页顶部的当前空间信息卡。
 *
 * 空间不再是文件，所以这里展示的不是「空间路径」，而是**整个笔记库的落盘位置**
 * （所有空间共用一个 `wordma.db`）。「在文件管理器中打开」定位的也是这个库文件。
 */
export function SpaceOverviewCard() {
  const activeSpace = useActiveSpace()
  const dbPath = useDbPath()
  const actions = useSpaceActions()
  const [notice, setNotice] = useState<string | null>(null)

  if (!activeSpace) return null

  async function handleBackup() {
    const res = await actions.backupSpace()
    if (res.ok) {
      setNotice(res.notice ?? "已备份")
      return
    }
    if (res.reason === "error") setNotice(res.error.message)
    // 用户取消 → 什么都不提示
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <SpaceIcon name={activeSpace.icon} className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{activeSpace.name}</p>
        {activeSpace.description && (
          <p className="truncate text-xs text-muted-foreground">{activeSpace.description}</p>
        )}
        <p className="truncate font-mono text-xs text-muted-foreground" title={dbPath ?? undefined}>
          {dbPath ? `笔记库：${dbPath}` : "笔记库位置未知"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          创建于 {formatDate(activeSpace.createdAt)}
        </p>
        {notice && (
          <p className="mt-1 truncate text-xs text-muted-foreground" title={notice}>
            {notice}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void actions.reveal()}
          disabled={!dbPath}
        >
          <FolderOpenIcon className="size-4" />
          在文件管理器中打开
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleBackup()} disabled={!dbPath}>
          <DatabaseBackupIcon className="size-4" />
          备份笔记库
        </Button>
      </div>
    </div>
  )
}
