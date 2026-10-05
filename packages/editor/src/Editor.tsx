/// <reference path="./env.d.ts" />
import { EditorContent, useEditor } from "@tiptap/react";
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
  placeholder,
}: WordmaEditorProps) {
  const editor = useEditor({
    // 初始内容按 markdown 解析（v3 的 contentType 选项）
    contentType: "markdown",
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      SlashCommand,
    ],
    content: initialValue,
    onUpdate({ editor }) {
      onChange(editor.getMarkdown());
    },
  });

  return (
    <div {...stylex.props(styles.root)}>
      <Toolbar editor={editor} />
      <div {...stylex.props(styles.scroll)}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
