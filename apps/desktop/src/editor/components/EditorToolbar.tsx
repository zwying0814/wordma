import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
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
  Table,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-muted-foreground",
        active &&
          "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="size-4" />
    </Button>
  );
}

export function EditorToolbar({
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
            alignLeft: e.isActive({ textAlign: "left" }),
            alignCenter: e.isActive({ textAlign: "center" }),
            alignRight: e.isActive({ textAlign: "right" }),
            alignJustify: e.isActive({ textAlign: "justify" }),
          }
        : null,
  });

  if (!editor || !state) {
    return null;
  }

  const run = (fn: (chain: ReturnType<Editor["chain"]>) => void) => () => {
    const chain = editor.chain().focus();
    fn(chain);
    chain.run();
  };

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2.5 py-1.5"
      role="toolbar"
      aria-label="编辑工具栏"
    >
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
        onClick={() => {
          if (!onPickImage) return;
          void onPickImage().then((url) => {
            if (url) editor.chain().focus().setImage({ src: url }).run();
          });
        }}
      />
      <Separator orientation="vertical" className="mx-1 h-[18px]" />
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
      <Separator orientation="vertical" className="mx-1 h-[18px]" />
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
      <Separator orientation="vertical" className="mx-1 h-[18px]" />
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
      <Separator orientation="vertical" className="mx-1 h-[18px]" />
      <ToolButton
        label="左对齐"
        icon={AlignLeft}
        active={state.alignLeft}
        onClick={run((c) => c.setTextAlign("left"))}
      />
      <ToolButton
        label="居中"
        icon={AlignCenter}
        active={state.alignCenter}
        onClick={run((c) => c.setTextAlign("center"))}
      />
      <ToolButton
        label="右对齐"
        icon={AlignRight}
        active={state.alignRight}
        onClick={run((c) => c.setTextAlign("right"))}
      />
      <ToolButton
        label="两端对齐"
        icon={AlignJustify}
        active={state.alignJustify}
        onClick={run((c) => c.setTextAlign("justify"))}
      />
      <Separator orientation="vertical" className="mx-1 h-[18px]" />
      <ToolButton
        label="插入表格"
        icon={Table}
        onClick={run((c) =>
          c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
        )}
      />
    </div>
  );
}
