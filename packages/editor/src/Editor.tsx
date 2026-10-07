/// <reference path="./env.d.ts" />
import { useRef } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import * as stylex from "@stylexjs/stylex";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { SlashCommand } from "./extensions/SlashCommand";
import "./editor.css";

export interface WordmaEditorProps {
  /** 初始 markdown 内容；编辑器为非受控，仅在挂载时读取（切换文章请用 key 重挂载） */
  initialValue: string;
  /** 内容变化回调，参数为 markdown 文本；请传入稳定引用（如 setState） */
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** 粘贴/拖入图片时调用：上传后返回插入 URL，返回 null 则忽略该图片 */
  onPasteImage?: (file: File) => Promise<string | null>;
  /** 工具栏“插入图片”点击时调用：返回插入 URL，null 表示取消 */
  onPickImage?: () => Promise<string | null>;
  /** 编辑器显示图片节点时，把 markdown 里的 src（如 /media/x.png）解析为可加载地址 */
  onResolveImageUrl?: (src: string) => string;
  /** 附加到 ProseMirror 元素上的类名（主题 content.css 的作用域挂点） */
  contentClassName?: string;
}


// ===== Markdown 粘贴启发式（移植自 reactjs-tiptap-editor 的 MarkdownPaste） =====
const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s+/m, // 标题
  /^\s*[-*+]\s+/m, // 无序列表
  /^\s*\d+\.\s+/m, // 有序列表
  /^\s*>\s+/m, // 引用
  /\*\*.+?\*\*/, // 加粗
  /\*[^*]+\*/, // 斜体
  /`[^`]+`/, // 行内代码
  /^```/m, // 代码块
  /^\s*---\s*$/m, // 分割线
  /\[.+?\]\(.+?\)/, // 链接
  /!\[.*?\]\(.+?\)/, // 图片
];

function looksLikeMarkdown(text: string): boolean {
  let matches = 0;
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(text) && ++matches >= 2) return true;
  }
  // 单特征命中：图片/代码块/分割线特征足够强，直接判定
  return (
    /!\[.*?\]\(.+?\)/.test(text) ||
    /^```/m.test(text) ||
    /^\s*---\s*$/m.test(text)
  );
}

/** 修复表格行之间被粘贴进来的空行（管道行之间的空行会破坏表格解析） */
function fixMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isRow = trimmed.startsWith("|") && trimmed.endsWith("|");
    if (trimmed === "" && inTable) continue;
    if (isRow) inTable = true;
    else inTable = false;
    result.push(line);
  }
  return result.join("\n");
}

const styles = stylex.create({
  bubble: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 4,
    backgroundColor: "var(--ant-color-bg-container)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 8,
    boxShadow: "var(--ant-box-shadow-secondary)",
  },
  bubbleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderStyle: "none",
    borderRadius: 4,
    padding: "2px 6px",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
    color: "var(--ant-color-text)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ant-color-fill-tertiary)",
    },
  },
  bubbleBtnActive: {
    color: "var(--ant-color-primary)",
    backgroundColor: {
      default: "var(--ant-color-primary-bg)",
      ":hover": "var(--ant-color-primary-bg)",
    },
  },
  bubbleBtnDanger: {
    color: "var(--ant-color-error)",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginInline: 4,
    backgroundColor: "var(--ant-color-border-secondary)",
  },
  root: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
    overflowY: "auto",
  },
});

export function WordmaEditor({
  initialValue,
  onChange,
  onPasteImage,
  onPickImage,
  onResolveImageUrl,
  placeholder,
  contentClassName,
}: WordmaEditorProps) {
  // 编辑器选项闭包经 ref 取最新引用，避免过期捕获
  const pasteRef = useRef(onPasteImage);
  pasteRef.current = onPasteImage;
  const resolveRef = useRef(onResolveImageUrl);
  resolveRef.current = onResolveImageUrl;

  // 图片渲染时经 resolveImageUrl 解析 src（markdown 中仍存公开路径），
  // 并按 align 属性设置对齐（居中/右靠时转为块级 + auto 边距）
  const ResolvedImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        align: {
          default: "center",
          parseHTML: (element) =>
            element.getAttribute("data-align") ?? element.getAttribute("align") ?? "center",
          renderHTML: (attributes) => ({ "data-align": attributes.align }),
        },
      };
    },
    // 自定义节点视图：显示时解析 src + 四角拖拽缩放（对齐 reactjs-tiptap-editor 的能力）
    addNodeView() {
      return ({ node, editor, getPos }) => {
        const wrapper = document.createElement("div");
        wrapper.classList.add("image-node-view");
        const img = document.createElement("img");
        img.draggable = false;
        const apply = (current: typeof node) => {
          img.src = resolveRef.current?.(current.attrs.src ?? "") ?? current.attrs.src ?? "";
          img.alt = current.attrs.alt ?? "";
          const w = current.attrs.width;
          img.style.width = typeof w === "number" ? `${w}px` : (w as string) ?? "auto";
          const align = (current.attrs.align as string) ?? "center";
          wrapper.style.marginInline =
            align === "center"
              ? "auto"
              : align === "right"
                ? "0 0 0 auto"
                : "0 auto 0 0";
        };
        apply(node);

        // 四角缩放手柄：pointer 拖拽实时改宽度，pointerup 一次性提交事务
        for (const dir of ["nw", "ne", "sw", "se"] as const) {
          const handle = document.createElement("div");
          handle.className = "resize-handle";
          handle.setAttribute("data-resize-handle", dir);
          handle.contentEditable = "false";
          handle.style.cssText = `${
            dir.includes("w") ? "left:0" : "right:0"
          };${dir.startsWith("n") ? "top:0" : "bottom:0"};cursor:${
            dir === "nw" || dir === "se" ? "nwse-resize" : "nesw-resize"
          };`;
          handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startWidth = img.getBoundingClientRect().width;
            handle.setPointerCapture(event.pointerId);
            const onMove = (ev: PointerEvent) => {
              const dx = ev.clientX - startX;
              const w = Math.max(
                60,
                Math.round(startWidth + (dir.includes("e") ? dx : -dx)),
              );
              img.style.width = `${w}px`;
            };
            const onUp = () => {
              handle.removeEventListener("pointermove", onMove);
              handle.removeEventListener("pointerup", onUp);
              const width = Math.round(parseFloat(img.style.width));
              const pos = getPos();
              if (typeof pos === "number") {
                editor.view.dispatch(
                  editor.view.state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    width,
                  }),
                );
              }
            };
            handle.addEventListener("pointermove", onMove);
            handle.addEventListener("pointerup", onUp);
          });
          wrapper.append(handle);
        }
        wrapper.append(img);

        return {
          dom: wrapper,
          ignoreMutation: () => true,
          // 手柄上的事件不交给 PM（避免拖拽被当作节点拖动/选区变化）
          stopEvent: (event) => {
            const target = event.target as HTMLElement | null;
            return !!target?.closest?.("[data-resize-handle]");
          },
          update: (updated) => {
            if (updated.type.name !== "image") return false;
            apply(updated);
            return true;
          },
        };
      };
    },
  });

  const editor = useEditor({
    // 内容按 HTML 解析（存储格式为 HTML）
    contentType: "html",
    extensions: [
      StarterKit,
      ResolvedImage.configure({
        allowBase64: false,
        // 拖拽图片四角/边框缩放，等比且限制最小尺寸
        resize: {
          enabled: true,
          directions: [
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ],
          minWidth: 60,
          minHeight: 40,
          alwaysPreserveAspectRatio: true,
        },
      }),
      // TableKit 打包 table/tableRow/tableCell/tableHeader 四件套
      TableKit.configure({
        table: { resizable: true },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      SlashCommand,
    ],
    content: initialValue,
    // contentClassName：主题 content.css 的作用域挂点
    editorProps: {
      attributes: {
        class: `tiptap ProseMirror ${contentClassName ?? ""}`,
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;

        // 1) 剪贴板里有图片文件：上传后插入
        const files = Array.from(clipboard?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length > 0 && pasteRef.current) {
          event.preventDefault();
          const upload = pasteRef.current;
          for (const file of files) {
            upload(file).then((url) => {
              if (url && editor) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            });
          }
          return true;
        }

        // 2) 粘贴的文本命中 markdown 特征：整段解析后插入
        //    （媒体库"复制 Markdown 引用"、外部编辑器复制等路径）
        const text = clipboard?.getData("text/plain") ?? "";
        if (text && looksLikeMarkdown(text)) {
          // Markdown 扩展在 Editor 上挂载的解析器（见 @tiptap/markdown 的接口增强）
          const manager = editor.markdown;
          if (manager) {
            event.preventDefault();
            const doc = manager.parse(fixMarkdownTables(text));
            editor.chain().focus().insertContent(doc.content ?? []).run();
            return true;
          }
        }

        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (f) => f.type.startsWith("image/"),
        );
        if (files.length === 0 || !pasteRef.current) return false;
        event.preventDefault();
        const upload = pasteRef.current;
        for (const file of files) {
          upload(file).then((url) => {
            if (url && editor) {
              editor.chain().focus().setImage({ src: url }).run();
            }
          });
        }
        return true;
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // 气泡状态：是否选中图片 / 当前图片对齐 / 是否在表格内
  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            isImage:
              e.state.selection instanceof NodeSelection &&
              e.state.selection.node.type.name === "image",
            imageAlign:
              (e.getAttributes("image").align as string | undefined) ?? "center",
            imageWidth:
              (e.getAttributes("image").width as string | number | undefined) ?? null,
            inTable: e.isActive("table"),
          }
        : null,
  });

  return (
    <div {...stylex.props(styles.root)}>
      <Toolbar editor={editor} onPickImage={onPickImage} />
      {/* 选中图片时的气泡：对齐 + 删除 */}
      <BubbleMenu
        editor={editor}
        pluginKey="imageBubble"
        options={{ placement: "top", offset: 10 }}
        shouldShow={({ state }) =>
          state.selection instanceof NodeSelection &&
          state.selection.node.type.name === "image"
        }
      >
        <div {...stylex.props(styles.bubble)}>
          <button
            type="button"
            title="左对齐"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor?.chain().focus().updateAttributes("image", { align: "left" }).run()
            }
            {...stylex.props(
              styles.bubbleBtn,
              editorState?.imageAlign === "left" && styles.bubbleBtnActive,
            )}
          >
            <AlignLeft size={14} />
          </button>
          <button
            type="button"
            title="居中"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor?.chain().focus().updateAttributes("image", { align: "center" }).run()
            }
            {...stylex.props(
              styles.bubbleBtn,
              editorState?.imageAlign === "center" && styles.bubbleBtnActive,
            )}
          >
            <AlignCenter size={14} />
          </button>
          <button
            type="button"
            title="右对齐"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor?.chain().focus().updateAttributes("image", { align: "right" }).run()
            }
            {...stylex.props(
              styles.bubbleBtn,
              editorState?.imageAlign === "right" && styles.bubbleBtnActive,
            )}
          >
            <AlignRight size={14} />
          </button>
          <span {...stylex.props(styles.divider)} />
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              title={`宽度 ${pct}%`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .updateAttributes("image", { width: `${pct}%` })
                  .run()
              }
              {...stylex.props(
                styles.bubbleBtn,
                (editorState?.imageWidth ?? "100%") === `${pct}%` &&
                  styles.bubbleBtnActive,
              )}
            >
              {pct}%
            </button>
          ))}
          <span {...stylex.props(styles.divider)} />
          <button
            type="button"
            title="删除图片"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().deleteSelection().run()}
            {...stylex.props(styles.bubbleBtn, styles.bubbleBtnDanger)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </BubbleMenu>
      {/* 光标在表格内时的气泡：行列操作 */}
      <BubbleMenu
        editor={editor}
        pluginKey="tableBubble"
        options={{ placement: "bottom", offset: 8 }}
        shouldShow={({ editor: e }) => e.isActive("table")}
      >
        <div {...stylex.props(styles.bubble)}>
          {(
            [
              ["行↑", () => editor?.chain().focus().addRowBefore().run()],
              ["行↓", () => editor?.chain().focus().addRowAfter().run()],
              ["列←", () => editor?.chain().focus().addColumnBefore().run()],
              ["列→", () => editor?.chain().focus().addColumnAfter().run()],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={fn}
              {...stylex.props(styles.bubbleBtn)}
            >
              {label}
            </button>
          ))}
          <span {...stylex.props(styles.divider)} />
          {(
            [
              ["删行", () => editor?.chain().focus().deleteRow().run()],
              ["删列", () => editor?.chain().focus().deleteColumn().run()],
            ] as const
          ).map(([label, fn]) => (
            <button
              key={label}
              type="button"
              title={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={fn}
              {...stylex.props(styles.bubbleBtn, styles.bubbleBtnDanger)}
            >
              {label}
            </button>
          ))}
          <span {...stylex.props(styles.divider)} />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleHeaderRow().run()}
            {...stylex.props(styles.bubbleBtn)}
          >
            表头
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().deleteTable().run()}
            {...stylex.props(styles.bubbleBtn, styles.bubbleBtnDanger)}
          >
            删表
          </button>
        </div>
      </BubbleMenu>
      <div {...stylex.props(styles.scroll)}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
