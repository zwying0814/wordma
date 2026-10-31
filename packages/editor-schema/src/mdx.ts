import { mergeAttributes, Node } from "@tiptap/core";
import type { NodeViewRenderer } from "@tiptap/core";

/** 单块源码上限（UTF-8 字节）；与 Rust 侧校验保持一致 */
export const MDX_SOURCE_LIMIT = 128 * 1024;
/** 单篇文档的 MDX 块数上限；与 Rust 侧校验保持一致 */
export const MDX_BLOCK_LIMIT = 50;

export const DEFAULT_MDX_SOURCE = [
  "## MDX 示例",
  "",
  "这是一个 MDX 块。切换到「源码」视图可以编辑。",
  "",
].join("\n");

export function createMdxBlockId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `mdx_${uuid}`;
  return `mdx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface MdxBlockOptions {
  defaultSource: string;
  /** 应用侧注入 NodeView；静态渲染不传 */
  nodeView?: () => NodeViewRenderer | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mdxBlock: {
      insertMdxBlock: (attrs?: { source?: string }) => ReturnType;
    };
  }
}

/**
 * MDX 源码块：JSON 里只存 blockId + source。
 * 源码不写进 HTML 属性，发布时由 content-renderer 编译成 JS 挂载。
 */
export const MdxBlock = Node.create<MdxBlockOptions>({
  name: "mdxBlock",
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { defaultSource: DEFAULT_MDX_SOURCE };
  },

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-wordma-mdx"),
        renderHTML: (attributes) =>
          attributes.blockId
            ? { "data-wordma-mdx": attributes.blockId as string }
            : {},
      },
      source: {
        default: "",
        parseHTML: () => "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-wordma-mdx]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "wordma-mdx" }),
      "MDX 内容需要 JavaScript",
    ];
  },

  addNodeView() {
    return this.options.nodeView?.() ?? null;
  },

  addCommands() {
    return {
      insertMdxBlock:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              blockId: createMdxBlockId(),
              source: attrs.source ?? this.options.defaultSource,
            },
          }),
    };
  },
});
