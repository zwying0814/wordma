import {
  BookOpenIcon,
  ClipboardListIcon,
  FileTextIcon,
  FolderIcon,
  HashIcon,
  LayersIcon,
  LibraryIcon,
  LightbulbIcon,
  NotebookPenIcon,
  PenLineIcon,
  StickyNoteIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react"

/**
 * 空间图标映射表：稳定字符串 key → Lucide 图标组件。
 * key 会落盘到 spaces.json（见 Space.icon），必须稳定、可序列化、
 * 与具体组件引用彻底解耦——绝不能像老代码那样存 <Icon/> 或靠引用相等判断选中。
 */
export const SPACE_ICON_MAP = {
  "book-open": BookOpenIcon,
  "notebook-pen": NotebookPenIcon,
  "file-text": FileTextIcon,
  "folder": FolderIcon,
  "layers": LayersIcon,
  "sticky-note": StickyNoteIcon,
  "library": LibraryIcon,
  "hash": HashIcon,
  "tag": TagIcon,
  "lightbulb": LightbulbIcon,
  "clipboard-list": ClipboardListIcon,
  "pen-line": PenLineIcon,
} as const satisfies Record<string, LucideIcon>

export type SpaceIconName = keyof typeof SPACE_ICON_MAP

export const DEFAULT_SPACE_ICON: SpaceIconName = "book-open"

/** 按 key 取图标组件，未知 key 回退默认，绝不返回 undefined（避免渲染炸） */
export function getSpaceIcon(name: string): LucideIcon {
  if (name in SPACE_ICON_MAP) {
    return SPACE_ICON_MAP[name as SpaceIconName]
  }
  return SPACE_ICON_MAP[DEFAULT_SPACE_ICON]
}

export function getSpaceIconNames(): SpaceIconName[] {
  return Object.keys(SPACE_ICON_MAP) as SpaceIconName[]
}
