import { useState } from "react"
import { FolderOpenIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { validateSpaceName } from "@/lib/space-name"
import {
  DEFAULT_SPACE_ICON,
  getSpaceIconNames,
  type SpaceIconName,
} from "@/lib/space-icons"
import { SpaceIcon } from "@/components/space/space-icon"
import { useSpaceActions, useSpacePending } from "@/stores/space-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actions = useSpaceActions()
  const pending = useSpacePending()

  // spaceDir 即空间文件夹本身（不再在其下再建一层名称子目录）
  const [spaceDir, setSpaceDir] = useState("")
  const [name, setName] = useState("")
  const [icon, setIcon] = useState<SpaceIconName>(DEFAULT_SPACE_ICON)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const trimmed = name.trim()
  const nameValidation =
    trimmed.length > 0 ? validateSpaceName(name) : { ok: true as const }
  const nameError = nameValidation.ok ? null : nameValidation.message

  const canSubmit =
    trimmed.length > 0 && nameValidation.ok && spaceDir.length > 0 && !pending

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      // 关闭：重置名称/图标与提交错误，保留 spaceDir（连续创建时不用反复选位置）
      setName("")
      setIcon(DEFAULT_SPACE_ICON)
      setSubmitError(null)
    }
  }

  async function handleBrowse() {
    const dir = await actions.pickSpaceDir()
    if (dir) {
      setSpaceDir(dir)
      setSubmitError(null)
    }
  }

  async function handleCreate() {
    if (!canSubmit) return
    setSubmitError(null)
    const result = await actions.createSpace({ spaceDir, name: trimmed, icon })
    if (result.ok) {
      handleOpenChange(false)
      return
    }
    if (result.reason === "cancelled") {
      // 创建不走系统 dialog，理论上不会到这里；静默保持打开
      return
    }
    // 表单类与存储类错误都贴在对话框内（不闪退到全局 banner）
    setSubmitError(result.error.message)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建空间</DialogTitle>
          <DialogDescription>
            选择一个空文件夹，wordma 会在其中创建空间配置文件，将其标记为你的笔记空间。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* 位置 */}
          <div className="grid gap-2">
            <label htmlFor="space-location" className="text-sm font-medium">
              位置
            </label>
            <div className="flex gap-2">
              <Input
                id="space-location"
                value={spaceDir}
                readOnly
                placeholder="未选择文件夹"
                className="flex-1 truncate"
                title={spaceDir}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleBrowse}
                disabled={pending}
              >
                <FolderOpenIcon className="size-4" />
                浏览…
              </Button>
            </div>
          </div>

          {/* 名称 */}
          <div className="grid gap-2">
            <label htmlFor="space-name" className="text-sm font-medium">
              空间名称
            </label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：我的第二大脑"
              autoFocus
              aria-invalid={nameError ? true : undefined}
              className={cn(nameError && "border-destructive")}
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          {/* 图标 */}
          <div className="grid gap-2">
            <span className="text-sm font-medium">空间图标</span>
            <div className="grid grid-cols-6 gap-2">
              {getSpaceIconNames().map((key) => {
                const selected = icon === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={`选择图标 ${key}`}
                    aria-pressed={selected}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md border transition-colors",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    <SpaceIcon name={key} className="size-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {submitError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button type="button" onClick={handleCreate} disabled={!canSubmit}>
            {pending ? "创建中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
