import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const bubbleClass =
  "flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-pop";

export function TableBubbleMenu({ editor }: { editor: Editor | null }) {
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
            onMouseDown={(e) => e.preventDefault()}
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
            onMouseDown={(e) => e.preventDefault()}
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
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          className="px-1.5 text-[11px]"
        >
          表头
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().deleteTable().run()}
          className="px-1.5 text-[11px] text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          删表
        </Button>
      </div>
    </BubbleMenu>
  );
}
