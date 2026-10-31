import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const bubbleClass =
  "flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-pop";
const activeClass =
  "bg-accent text-primary hover:bg-accent hover:text-primary";

export function ImageBubbleMenu({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            align: (e.getAttributes("image").align as string | undefined) ?? "center",
            width:
              (e.getAttributes("image").width as string | number | undefined) ??
              null,
            alt: (e.getAttributes("image").alt as string | undefined) ?? "",
          }
        : null,
  });

  if (!editor) return null;

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
      onMouseDown={(e) => e.preventDefault()}
      onClick={() =>
        editor.chain().focus().updateAttributes("image", { align }).run()
      }
      className={cn(
        "text-foreground",
        state?.align === align && activeClass,
      )}
    >
      <Icon className="size-3.5" />
    </Button>
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubble"
      options={{ placement: "top", offset: 10 }}
      shouldShow={({ state: editorState }) =>
        editorState.selection instanceof NodeSelection &&
        editorState.selection.node.type.name === "image"
      }
    >
      <div className={bubbleClass}>
        {alignButton("左对齐", "left", AlignLeft)}
        {alignButton("居中", "center", AlignCenter)}
        {alignButton("右对齐", "right", AlignRight)}
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        {[25, 50, 75, 100].map((pct) => {
          const active = (state?.width ?? "100%") === `${pct}%`;
          return (
            <Button
              key={pct}
              type="button"
              variant="ghost"
              size="xs"
              title={`宽度 ${pct}%`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { width: `${pct}%` })
                  .run()
              }
              className={cn("px-1.5 text-[11px]", active && activeClass)}
            >
              {pct}%
            </Button>
          );
        })}
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        <Input
          value={state?.alt ?? ""}
          placeholder="alt 文本"
          aria-label="图片替代文本"
          className="h-6 w-[110px] text-xs"
          onChange={(e) =>
            editor.chain().updateAttributes("image", { alt: e.target.value }).run()
          }
        />
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="删除图片"
          aria-label="删除图片"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().deleteSelection().run()}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </BubbleMenu>
  );
}
