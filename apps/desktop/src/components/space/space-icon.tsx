import type { LucideIcon } from "lucide-react"

import { getSpaceIcon } from "@/lib/space-icons"

/**
 * 按稳定字符串 key 渲染空间图标。
 * 不直接存组件引用，过 IPC 可序列化、不会出现 An object could not be cloned。
 */
export function SpaceIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const Icon: LucideIcon = getSpaceIcon(name)
  return <Icon className={className} />
}
