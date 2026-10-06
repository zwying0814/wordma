/// <reference path="./env.d.ts" />
import { useRef } from "react";
import { mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Image } from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import * as stylex from "@stylexjs/stylex";
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
}

const styles = stylex.create({
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
}: WordmaEditorProps) {
  // 编辑器选项闭包经 ref 取最新引用，避免过期捕获
  const pasteRef = useRef(onPasteImage);
  pasteRef.current = onPasteImage;
  const resolveRef = useRef(onResolveImageUrl);
  resolveRef.current = onResolveImageUrl;

  // 图片渲染时经 resolveImageUrl 解析 src（markdown 中仍存公开路径）
  const ResolvedImage = Image.extend({
    renderHTML({ node, HTMLAttributes }) {
      const src = (node.attrs.src as string) ?? "";
      const resolved = resolveRef.current?.(src) ?? src;
      return ["img", mergeAttributes(HTMLAttributes, { src: resolved })];
    },
  });

  const editor = useEditor({
    // 初始内容按 markdown 解析（v3 的 contentType 选项）
    contentType: "markdown",
    extensions: [
      StarterKit,
      ResolvedImage.configure({ allowBase64: false }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      SlashCommand,
    ],
    content: initialValue,
    onUpdate({ editor }) {
      onChange(editor.getMarkdown());
    },
    editorProps: {
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

        // 2) 粘贴的文本包含图片语法：按 markdown 解析后插入
        //    （媒体库"复制 Markdown 引用" → 粘贴到文章的路径）
        const text = clipboard?.getData("text/plain") ?? "";
        if (text && /!\[[^\]]*\]\([^)]+\)/.test(text)) {
          // Markdown 扩展在 Editor 上挂载的解析器（见 @tiptap/markdown 的接口增强）
          const manager = editor.markdown;
          if (manager) {
            event.preventDefault();
            const doc = manager.parse(text);
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
  });

  return (
    <div {...stylex.props(styles.root)}>
      <Toolbar editor={editor} onPickImage={onPickImage} />
      <div {...stylex.props(styles.scroll)}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
