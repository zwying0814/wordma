import { useEffect, type ReactElement, type ReactNode } from "react"
import { useLocation } from "wouter"

import { AppSidebar } from "@/components/sidebar/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import {
  BrowserModeNotice,
  EmptySpaceState,
  SpaceErrorState,
} from "@/components/space/empty-space-state"
import {
  useActiveSpace,
  useSpaceActions,
  useSpaceStatus,
  useSpaces,
  type SpaceStatus,
} from "@/stores/space-store"

// 文章功能已下线（本次迁移只保留 space），路由表同步收敛
const pageTitles: Record<string, string> = {
  "/tags": "标签",
  "/categories": "分类",
}

export default function AppLayout({ children }: { children: ReactNode }): ReactElement {
  const [location] = useLocation()
  const status = useSpaceStatus()
  const spaces = useSpaces()
  const activeSpace = useActiveSpace()
  const actions = useSpaceActions()

  // 启动时拉取空间列表并自动恢复上次空间（action 引用永久稳定，effect 只跑一次；
  // bootstrap 内部有 idle 幂等保护，兼容 StrictMode 双调用）
  useEffect(() => {
    void actions.bootstrap()
  }, [actions])

  // 有笔记空间 → 渲染侧边栏 + 业务内容；无任何空间（或仍在加载 / 浏览器预览模式 /
  // 加载失败）→ 整页展示引导或状态，不渲染侧边栏。侧边栏的出现即代表空间已存在。
  const hasSpace = status === "ready" && spaces.length > 0

  if (!hasSpace) {
    return <NoSpaceScreen status={status} />
  }

  // ===== 以下为「有空间」时的完整布局 =====
  const title = pageTitles[location] ?? "功能页面"

  // 面包屑第一段 = 当前空间名；异常态（有列表但无激活空间）退化为首个空间名
  const breadcrumbRoot = activeSpace ? activeSpace.name : (spaces[0]?.name ?? "笔记空间")

  // 内容区：空间是库里的一行，「目录失效」这种状态已不存在，直接渲染业务页
  const content: ReactNode = <>{children}</>

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbPage>{breadcrumbRoot}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{content}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * 无空间（或加载中 / 浏览器预览模式 / 加载失败）时的整页展示。
 * 不渲染侧边栏——侧边栏的出现即代表已存在笔记空间。
 */
function NoSpaceScreen({ status }: { status: SpaceStatus }): ReactElement {
  let page: ReactNode
  if (status === "loading" || status === "idle") {
    page = <div className="text-sm text-muted-foreground">加载中…</div>
  } else if (status === "unavailable") {
    page = <BrowserModeNotice />
  } else if (status === "error") {
    page = <SpaceErrorState />
  } else {
    // status === "ready" 但无任何空间 → 初始页面（引导新建 / 打开）
    page = <EmptySpaceState />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      {page}
    </div>
  )
}
