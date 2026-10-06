import { Selection as MonacoSelection, type editor } from "monaco-editor";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
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

type SourceEditor = editor.IStandaloneCodeEditor;

interface Props {
  editor: SourceEditor | null;
  onPickImage?: () => Promise<string | null>;
}

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
  disabled = false,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      {...stylex.props(styles.btn)}
    >
      <Icon size={16} />
    </button>
  );
}

function insertText(ed: SourceEditor, text: string) {
  const sel = ed.getSelection();
  if (!sel) return;
  ed.executeEdits("wordma", [{ range: sel, text, forceMoveMarkers: true }]);
}

/** 包裹/解除包裹选区（如 **加粗**） */
function wrapSelection(ed: SourceEditor, marker: string) {
  const sel = ed.getSelection();
  const model = ed.getModel();
  if (!sel || !model) return;
  const text = model.getValueInRange(sel);
  const wrapped =
    text.startsWith(marker) &&
    text.endsWith(marker) &&
    text.length >= marker.length * 2;
  const inner = wrapped
    ? text.slice(marker.length, text.length - marker.length)
    : `${marker}${text}${marker}`;
  ed.executeEdits("wordma", [{ range: sel, text: inner, forceMoveMarkers: true }]);
  // 恢复选区到内容本身
  ed.setSelection(
    new MonacoSelection(
      sel.startLineNumber,
      sel.startColumn + (wrapped ? -marker.length : marker.length),
      sel.endLineNumber,
      sel.endColumn + (wrapped ? -marker.length : marker.length),
    ),
  );
}

/** 对选中的行做行首前缀切换（如 "- "、"## "） */
function toggleLinePrefix(ed: SourceEditor, prefix: string) {
  const sel = ed.getSelection();
  const model = ed.getModel();
  if (!sel || !model) return;
  let allPrefixed = true;
  for (let line = sel.startLineNumber; line <= sel.endLineNumber; line++) {
    if (!model.getLineContent(line).startsWith(prefix)) {
      allPrefixed = false;
      break;
    }
  }
  const edits = [];
  for (let line = sel.startLineNumber; line <= sel.endLineNumber; line++) {
    const has = model.getLineContent(line).startsWith(prefix);
    if (has === allPrefixed) {
      edits.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: has ? prefix.length + 1 : 1,
        },
        text: has ? "" : prefix,
      });
    }
  }
  if (edits.length > 0) ed.executeEdits("wordma", edits);
}

export function Toolbar({ editor, onPickImage }: Props) {
  if (!editor) {
    return <div {...stylex.props(styles.bar)} />;
  }

  return (
    <div {...stylex.props(styles.bar)} role="toolbar" aria-label="编辑工具栏">
      <ToolButton
        label="撤销"
        icon={Undo2}
        onClick={() => editor.trigger("toolbar", "undo", null)}
      />
      <ToolButton
        label="重做"
        icon={Redo2}
        onClick={() => editor.trigger("toolbar", "redo", null)}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="标题 1"
        icon={Heading1}
        onClick={() => toggleLinePrefix(editor, "# ")}
      />
      <ToolButton
        label="标题 2"
        icon={Heading2}
        onClick={() => toggleLinePrefix(editor, "## ")}
      />
      <ToolButton
        label="标题 3"
        icon={Heading3}
        onClick={() => toggleLinePrefix(editor, "### ")}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="加粗"
        icon={Bold}
        onClick={() => wrapSelection(editor, "**")}
      />
      <ToolButton
        label="斜体"
        icon={Italic}
        onClick={() => wrapSelection(editor, "*")}
      />
      <ToolButton
        label="删除线"
        icon={Strikethrough}
        onClick={() => wrapSelection(editor, "~~")}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="无序列表"
        icon={List}
        onClick={() => toggleLinePrefix(editor, "- ")}
      />
      <ToolButton
        label="有序列表"
        icon={ListOrdered}
        onClick={() => toggleLinePrefix(editor, "1. ")}
      />
      <ToolButton
        label="引用"
        icon={Quote}
        onClick={() => toggleLinePrefix(editor, "> ")}
      />
      <ToolButton
        label="代码块"
        icon={SquareCode}
        onClick={() => {
          const sel = editor.getSelection();
          insertText(editor, "```\n\n```");
          if (sel) {
            // 光标移入代码块内部的空行
            editor.setPosition({
              lineNumber: sel.startLineNumber + 1,
              column: 1,
            });
          }
        }}
      />
      <ToolButton
        label="分割线"
        icon={Minus}
        onClick={() => insertText(editor, "\n---\n")}
      />
      <span {...stylex.props(styles.divider)} />
      <ToolButton
        label="插入图片"
        icon={ImagePlus}
        disabled={!onPickImage}
        onClick={() => onPickImage?.()}
      />
    </div>
  );
}
