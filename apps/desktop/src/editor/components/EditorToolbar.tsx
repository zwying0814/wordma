import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CODE_LANGUAGES } from "@wordma/editor-schema";
import { Button } from "@/components/ui/button";
import { TableGridPicker } from "./TableGridPicker";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

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
            underline: e.isActive("underline"),
            headingLevel:
              HEADING_LEVELS.find((level) =>
                e.isActive("heading", { level }),
              ) ?? 0,
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
            blockquote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            language:
              (e.getAttributes("codeBlock").language as string | undefined) ??
              "plaintext",
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
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="段落样式"
          className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {state.headingLevel ? `H${state.headingLevel}` : "正文"}
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[130px]">
          <DropdownMenuItem
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            正文
          </DropdownMenuItem>
          {HEADING_LEVELS.map((level) => (
            <DropdownMenuItem
              key={level}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level }).run()
              }
            >
              H{level} 标题
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
      <ToolButton
        label="下划线"
        icon={Underline}
        active={state.underline}
        onClick={run((c) => c.toggleUnderline())}
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
      {state.codeBlock ? (
        <Select
          value={state.language}
          onValueChange={(value) =>
            editor
              .chain()
              .focus()
              .updateAttributes("codeBlock", { language: value })
              .run()
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="代码语言"
            className="h-7 w-[128px] text-xs"
          >
            <SelectValue>
              {(selected) =>
                CODE_LANGUAGES.find((item) => item.value === selected)?.label ??
                "纯文本"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" className="max-h-[280px]">
            {CODE_LANGUAGES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
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
      <TableGridPicker editor={editor} />
      <Separator orientation="vertical" className="mx-1 h-[18px]" />
      <ToolButton
        label="清除格式"
        icon={RemoveFormatting}
        onClick={run((c) => c.unsetAllMarks().clearNodes())}
      />
    </div>
  );
}
