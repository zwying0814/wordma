import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Table,
  type LucideIcon,
} from "lucide-react";
import { SlashMenu, type SlashMenuHandle } from "../components/SlashMenu";

export interface SlashMenuItem {
  key: string;
  label: string;
  desc?: string;
  icon: LucideIcon;
  command: (ctx: { editor: Editor; range: Range }) => void;
}

const chain =
  (fn: (chain: ReturnType<Editor["chain"]>) => void) =>
  ({ editor, range }: { editor: Editor; range: Range }) => {
    const c = editor.chain().focus().deleteRange(range);
    fn(c);
    c.run();
  };

const DEFAULT_ITEMS: SlashMenuItem[] = [
  {
    key: "h1",
    label: "标题 1",
    desc: "章节大标题",
    icon: Heading1,
    command: chain((c) => c.setNode("heading", { level: 1 })),
  },
  {
    key: "h2",
    label: "标题 2",
    desc: "小节标题",
    icon: Heading2,
    command: chain((c) => c.setNode("heading", { level: 2 })),
  },
  {
    key: "h3",
    label: "标题 3",
    desc: "子标题",
    icon: Heading3,
    command: chain((c) => c.setNode("heading", { level: 3 })),
  },
  {
    key: "bulletList",
    label: "无序列表",
    desc: "- 列表项",
    icon: List,
    command: chain((c) => c.toggleBulletList()),
  },
  {
    key: "orderedList",
    label: "有序列表",
    desc: "1. 列表项",
    icon: ListOrdered,
    command: chain((c) => c.toggleOrderedList()),
  },
  {
    key: "blockquote",
    label: "引用",
    desc: "> 名言或摘录",
    icon: Quote,
    command: chain((c) => c.toggleBlockquote()),
  },
  {
    key: "codeBlock",
    label: "代码块",
    desc: "等宽字体",
    icon: SquareCode,
    command: chain((c) => c.toggleCodeBlock()),
  },
  {
    key: "horizontalRule",
    label: "分割线",
    desc: "分隔内容",
    icon: Minus,
    command: chain((c) => c.setHorizontalRule()),
  },
  {
    key: "table",
    label: "表格",
    desc: "3×3 带表头",
    icon: Table,
    command: chain((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
  },
];

/** 输入 "/" 唤出的命令菜单；菜单 UI 由 antd 渲染（SlashMenu） */
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return { items: DEFAULT_ITEMS };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashMenuItem>({
        editor: this.editor,
        char: "/",
        items: ({ query }) =>
          this.options.items.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
          ),
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle> | null = null;
          let popup: HTMLDivElement | null = null;

          const syncPosition = (rect: DOMRect | null | undefined) => {
            if (!popup || !rect) return;
            popup.style.top = `${rect.bottom + 6}px`;
            popup.style.left = `${rect.left}px`;
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, {
                editor: props.editor,
                props: { items: props.items, command: props.command },
              });
              popup = document.createElement("div");
              popup.style.position = "fixed";
              popup.style.zIndex = "1050";
              popup.appendChild(renderer.element as HTMLElement);
              document.body.appendChild(popup);
              syncPosition(props.clientRect?.());
            },
            onUpdate: (props) => {
              renderer?.updateProps({ items: props.items, command: props.command });
              syncPosition(props.clientRect?.());
            },
            onKeyDown: (props) => renderer?.ref?.onKeyDown(props) ?? false,
            onExit: () => {
              popup?.remove();
              popup = null;
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
