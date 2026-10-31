import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const bubbleClass =
  "flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-pop";
const activeClass =
  "bg-accent text-primary hover:bg-accent hover:text-primary";

export function TableBubbleMenu({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            canMerge: e.can().mergeCells(),
            canSplit: e.can().splitCell(),
            align:
              (e.getAttributes("tableCell").align ??
                e.getAttributes("tableHeader").align ??
                null) as string | null,
          }
        : null,
  });

  if (!editor) return null;

  const actions: [string, () => void][] = [
    ["行↑", () => editor.chain().focus().addRowBefore().run()],
    ["行↓", () => editor.chain().focus().addRowAfter().run()],
    ["列←", () => editor.chain().focus().addColumnBefore().run()],
    ["列→", () => editor.chain().focus().addColumnAfter().run()],
  ];
  const destructive: [string, () => void][] = [
    ["删行", () => editor.chain().focus().deleteRow().run()],
    ["删列", () => editor.chain().focus().deleteColumn().run()],
  ];

  const alignButton = (
    label: string,
    align: "left" | "center" | "right",
    Icon: typeof AlignLeft,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title={label}
      aria-label={label}
      aria-pressed={state?.align === align}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() =>
        editor.chain().focus().setCellAttribute("align", align).run()
      }
      className={cn("text-foreground", state?.align === align && activeClass)}
    >
      <Icon className="size-3.5" />
    </Button>
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBubble"
      options={{ placement: "bottom-start", offset: 8 }}
      shouldShow={({ editor: current }) => current.isActive("table")}
    >
      <div className={bubbleClass}>
        {actions.map(([label, run]) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={run}
            className="px-1.5 text-[11px]"
          >
            {label}
          </Button>
        ))}
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        {destructive.map(([label, run]) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="xs"
            title={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={run}
            className="px-1.5 text-[11px] text-destructive hover:bg-destructive-soft hover:text-destructive"
          >
            {label}
          </Button>
        ))}
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!state?.canMerge}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().mergeCells().run()}
          className="px-1.5 text-[11px]"
        >
          合并
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!state?.canSplit}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().splitCell().run()}
          className="px-1.5 text-[11px]"
        >
          拆分
        </Button>
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        {alignButton("左对齐", "left", AlignLeft)}
        {alignButton("居中", "center", AlignCenter)}
        {alignButton("右对齐", "right", AlignRight)}
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          className="px-1.5 text-[11px]"
        >
          表头
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().deleteTable().run()}
          className="px-1.5 text-[11px] text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          删表
        </Button>
      </div>
    </BubbleMenu>
  );
}
