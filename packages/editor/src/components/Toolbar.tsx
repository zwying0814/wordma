import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Heading1,
  ImagePlus,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  bar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
    padding: "6px 10px",
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderStyle: "none",
    borderRadius: 6,
    padding: 0,
    cursor: "pointer",
    color: "var(--ant-color-text-secondary)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ant-color-fill-tertiary)",
    },
  },
  btnActive: {
    color: "var(--ant-color-primary)",
    backgroundColor: {
      default: "var(--ant-color-primary-bg)",
      ":hover": "var(--ant-color-primary-bg-hover)",
    },
  },
  divider: {
    width: 1,
    height: 18,
    marginInline: 4,
    backgroundColor: "var(--ant-color-border-secondary)",
  },
});

function ToolButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      {...stylex.props(styles.btn, active && styles.btnActive)}
    >
      <Icon size={16} />
    </button>
  );
}

export function Toolbar({
  editor,
  onPickImage,
}: {
  editor: Editor | null;
  onPickImage?: () => Promise<string | null>;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            blockquote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
          }
        : null,
  });

  if (!editor || !state) {
    return null;
  }

  const run = (fn: (c: ReturnType<Editor["chain"]>) => void) => () => {
    const c = editor.chain().focus();
    fn(c);
    c.run();
  };

  return (
    <div {...stylex.props(styles.bar)} role="toolbar" aria-label="编辑工具栏">
      <ToolButton
        label="撤销"
        icon={Undo2}
        disabled={!state.canUndo}
        onClick={run((c) => c.undo())}
      />
      <ToolButton
        label="重做"
        icon={Redo2}
        disabled={!state.canRedo}
        onClick={run((c) => c.redo())}
      />
      <ToolButton
        label="插入图片"
        icon={ImagePlus}
        disabled={!editor}
        onClick={() => {
          if (!onPickImage || !editor) return;
          onPickImage().then((url) => {
            if (url) editor.chain().focus().setImage({ src: url }).run();
          });
        }}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="标题 1"
        icon={Heading1}
        active={state.h1}
        onClick={run((c) => c.toggleHeading({ level: 1 }))}
      />
      <ToolButton
        label="标题 2"
        icon={Heading2}
        active={state.h2}
        onClick={run((c) => c.toggleHeading({ level: 2 }))}
      />
      <ToolButton
        label="标题 3"
        icon={Heading3}
        active={state.h3}
        onClick={run((c) => c.toggleHeading({ level: 3 }))}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="加粗"
        icon={Bold}
        active={state.bold}
        onClick={run((c) => c.toggleBold())}
      />
      <ToolButton
        label="斜体"
        icon={Italic}
        active={state.italic}
        onClick={run((c) => c.toggleItalic())}
      />
      <ToolButton
        label="删除线"
        icon={Strikethrough}
        active={state.strike}
        onClick={run((c) => c.toggleStrike())}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="无序列表"
        icon={List}
        active={state.bulletList}
        onClick={run((c) => c.toggleBulletList())}
      />
      <ToolButton
        label="有序列表"
        icon={ListOrdered}
        active={state.orderedList}
        onClick={run((c) => c.toggleOrderedList())}
      />
      <ToolButton
        label="引用"
        icon={Quote}
        active={state.blockquote}
        onClick={run((c) => c.toggleBlockquote())}
      />
      <ToolButton
        label="代码块"
        icon={SquareCode}
        active={state.codeBlock}
        onClick={run((c) => c.toggleCodeBlock())}
      />
      <ToolButton
        label="分割线"
        icon={Minus}
        onClick={run((c) => c.setHorizontalRule())}
      />
    </div>
  );
}
