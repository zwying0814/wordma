import { FileTextIcon, FolderTreeIcon, TagsIcon } from "lucide-react"
import * as React from "react"
import { Link, useLocation } from "wouter"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export type PageItem = {
  title: string
  to: string
  icon: React.ReactNode
  count: number
}

// 导航项统一静态占位，count 暂为 0（文章数据接入后由 store 驱动）
const pages: PageItem[] = [
  { title: "文章", to: "/articles", icon: <FileTextIcon />, count: 0 },
  { title: "标签", to: "/tags", icon: <TagsIcon />, count: 0 },
  { title: "分类", to: "/categories", icon: <FolderTreeIcon />, count: 0 },
]

export function NavPages() {
  const [location] = useLocation()

  return (
    <SidebarGroup>
      <SidebarMenu>
        {pages.map((item) => {
          const active = location === item.to
          return (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                className="h-12 gap-4"
                tooltip={item.title}
                isActive={active}
                // wouter Link 渲染 <a>，base-ui 通过 render 把它换成 SidebarMenuButton 的真实元素
                render={<Link href={item.to} />}
              >
                {item.icon}
                <span className="flex-1 text-sm">{item.title}</span>
                <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}