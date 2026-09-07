import { useEffect, useState } from "react"
import {
  FolderOpenIcon,
  MonitorIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  useScannedSpaces,
  useSpaceActions,
  useSpaceError,
  useScanStatus,
} from "@/stores/space-store"
import { CreateSpaceDialog } from "@/components/sidebar/create-space-dialog"
import { SpaceIcon } from "@/components/space/space-icon"
import { Button } from "@/components/ui/button"

/** 浏览器预览模式：无原生能力，引导去桌面端 */
export function BrowserModeNotice() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <MonitorIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">浏览器预览模式</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        笔记空间功能依赖桌面端的本地文件夹能力，请在桌面应用中使用「新建空间」与「打开文件夹」。
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

/** 无空间引导页：新建入口 + 自动扫描默认数据目录下的已有空间列表 */
export function EmptySpaceState() {
  const actions = useSpaceActions()
  const scanned = useScannedSpaces()
  const scanStatus = useScanStatus()
  const [createOpen, setCreateOpen] = useState(false)

  // 首次进入自动扫描一次；store 内有防重入，StrictMode 双跑 effect 无副作用
  useEffect(() => {
    void actions.scanSpaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasScanned = scanStatus === "done"

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-10 text-center">
      <FolderOpenIcon className="size-10 text-muted-foreground/60" />
      <h1 className="text-lg font-medium">还没有笔记空间</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        新建一个笔记空间（自动存放在默认数据目录），或从下方扫描结果中打开已有的空间。
      </p>
      <div className="flex gap-2">
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          新建空间
        </Button>
        <Button
          variant="outline"
          disabled={scanStatus === "scanning"}
          onClick={() => void actions.scanSpaces()}
        >
          <RefreshCwIcon
            className={scanStatus === "scanning" ? "size-4 animate-spin" : "size-4"}
          />
          {scanStatus === "scanning" ? "扫描中…" : "重新扫描"}
        </Button>
      </div>

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 扫描结果列表 */}
      {hasScanned && scanned.length > 0 && (
        <div className="mt-4 w-full max-w-xl">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            在默认数据目录中找到 {scanned.length} 个已有空间
          </p>
          <ul className="divide-y rounded-lg border text-left">
            {scanned.map((item) => (
              <li
                key={`${item.id}-${item.path}`}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border">
                  <SpaceIcon name={item.icon} className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground" title={item.path}>
                    {item.path}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={item.registered}
                  onClick={() => void actions.openSpace(item.path)}
                >
                  {item.registered ? "已在列表中" : "打开"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasScanned && scanned.length === 0 && (
        <p className="text-xs text-muted-foreground">
          默认数据目录中没有找到已有空间
        </p>
      )}
    </div>
  )
}
