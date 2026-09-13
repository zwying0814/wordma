import { useState } from "react"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  MonitorIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"

import { SpaceIcon } from "@/components/space/space-icon"
import {
  useActiveSpace,
  useSpaceActions,
  useSpaceStatus,
  useSpaces,
} from "@/stores/space-store"
import { CreateSpaceDialog } from "@/components/sidebar/create-space-dialog"
import { ManageSpacesDialog } from "@/components/sidebar/manage-spaces-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

/**
 * 读取 zustand 全局空间状态的侧栏切换器。四态渲染：
 *  - unavailable：浏览器预览模式（无原生能力，操作置灰）
 *  - loading / idle：骨架
 *  - ready 无空间：引导 trigger（不再整块消失）
 *  - ready 有空间：正常下拉（副标题显示就绪状态，失效时 ⚠️）
 * 不再有 `if (!activeSpace) return null`（旧代码首屏切换器消失的 bug 根源）。
 */
export function SpaceSwitcher() {
  const { isMobile } = useSidebar()
  const status = useSpaceStatus()
  const spaces = useSpaces()
  const activeSpace = useActiveSpace()
  const actions = useSpaceActions()

  const [createOpen, setCreateOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  if (status === "unavailable") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            disabled
            className="cursor-not-allowed opacity-70"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <MonitorIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">浏览器预览模式</span>
              <span className="truncate text-xs">空间功能需在桌面端使用</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (status === "loading" || status === "idle") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-lg" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  // ready 或 error（error 由内容区横幅处理）：侧边栏仅在存在笔记空间时渲染，
  // 因此此处始终有空间，直接渲染下拉切换器即可，无需「选择笔记空间」引导入口。
  // current 优先取激活空间，异常态（有列表但无激活空间）退化为首个空间。
  const current = activeSpace ?? spaces[0]

  function openCreateDeferred() {
    // 延后一帧，避免与 Menu.Item 的 closeOnClick 抢焦点导致闪烁
    requestAnimationFrame(() => setCreateOpen(true))
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {current ? (
                <SpaceIcon name={current.icon} className="size-4" />
              ) : (
                <PlusIcon className="size-4" />
              )}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {current?.name ?? "笔记空间"}
              </span>
              <span className="truncate text-xs">
                {current ? "空间已就绪" : "笔记空间"}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
            className="w-fit"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                笔记空间
              </DropdownMenuLabel>
              {spaces.map((space) => (
                <DropdownMenuItem
                  key={space.id}
                  onClick={() => void actions.setActive(space.id)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <SpaceIcon name={space.icon} className="size-4" />
                  </div>
                  <span className="flex-1 truncate">{space.name}</span>
                  {space.id === activeSpace?.id && (
                    <CheckIcon className="size-4 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 p-2" onClick={openCreateDeferred}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">新建空间</div>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 p-2"
                onClick={() => setManageOpen(true)}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Settings2Icon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">管理空间…</div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ManageSpacesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </SidebarMenu>
  )
}
