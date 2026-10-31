import type { JSONContent, NodeViewRenderer } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import StarterKit from "@tiptap/starter-kit";

/** 图片节点：在 Tiptap 内置 width/height 之外增加 align，渲染为 data-align 供主题排版使用 */
export const ImageNode = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element) =>
          element.getAttribute("data-align") ??
          element.getAttribute("align") ??
          "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align }),
      },
    };
  },
});

export interface SchemaOptions {
  placeholder?: string;
  /** 应用侧注入图片 NodeView（缩放手柄/媒体 URL 解析）；静态渲染不传 */
  imageNodeView?: () => NodeViewRenderer | null;
}

/**
 * 编辑器与静态渲染器共用的节点/标记清单。
 * 应用侧只在此之上追加 NodeView 与 UI 专用扩展（Markdown 粘贴、斜杠命令）。
 */
export function createSchemaExtensions(options: SchemaOptions = {}) {
  const image = ImageNode.extend({
    addNodeView() {
      return options.imageNodeView?.() ?? null;
    },
  }).configure({
    allowBase64: false,
    resize: {
      enabled: true,
      directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
      minWidth: 60,
      minHeight: 40,
      alwaysPreserveAspectRatio: true,
    },
  });

  return [
    StarterKit,
    image,
    TableKit.configure({ table: { resizable: true } }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Placeholder.configure({ placeholder: options.placeholder ?? "" }),
  ];
}

export type { JSONContent };
