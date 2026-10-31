import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Baseline, ChevronDown, Highlighter } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TEXT_COLORS = [
  { value: "#1f2328", label: "墨色" },
  { value: "#c92a2a", label: "红色" },
  { value: "#e8590c", label: "橙色" },
  { value: "#2f9e44", label: "绿色" },
  { value: "#1971c2", label: "蓝色" },
  { value: "#7048e8", label: "紫色" },
  { value: "#c2255c", label: "粉色" },
  { value: "#868e96", label: "灰色" },
] as const;

const HIGHLIGHTS = [
  { value: "#fff3bf", label: "鹅黄" },
  { value: "#d3f9d8", label: "浅绿" },
  { value: "#d0ebff", label: "浅蓝" },
  { value: "#ffdeeb", label: "浅粉" },
  { value: "#e5dbff", label: "浅紫" },
  { value: "#ffe8cc", label: "浅橙" },
  { value: "#e9ecef", label: "浅灰" },
  { value: "#ffc9c9", label: "浅红" },
] as const;

function Swatch({
  color,
  label,
  active,
  onClick,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "size-5 rounded-[4px] border border-border transition-transform hover:scale-110",
        active && "ring-2 ring-primary ring-offset-1 ring-offset-popover",
      )}
      style={{ backgroundColor: color }}
    />
  );
}

export function ColorMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      highlight:
        (e.getAttributes("highlight").color as string | undefined) ?? null,
    }),
  });

  const pickTextColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
    setOpen(false);
  };

  const pickHighlight = (color: string) => {
    editor.chain().focus().setHighlight({ color }).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="文字颜色与高亮"
        aria-label="文字颜色与高亮"
        className={cn(
          "flex h-7 items-center gap-0.5 rounded-sm px-1 text-muted-foreground transition-colors hover:bg-muted",
          open && "bg-accent text-accent-foreground",
        )}
      >
        <span className="flex flex-col items-center">
          <Baseline className="size-4" />
          <span
            className="mt-px h-[3px] w-4 rounded-full bg-current"
            style={
              state?.color ? { backgroundColor: state.color } : undefined
            }
          />
        </span>
        <ChevronDown className="size-3" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[228px] gap-2.5 p-2.5">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              文字颜色
            </span>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              默认
            </button>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {TEXT_COLORS.map((item) => (
              <Swatch
                key={item.value}
                color={item.value}
                label={item.label}
                active={state?.color === item.value}
                onClick={() => pickTextColor(item.value)}
              />
            ))}
          </div>
        </div>
        <div className="border-t border-border pt-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Highlighter className="size-3" />
              背景高亮
            </span>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              清除
            </button>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {HIGHLIGHTS.map((item) => (
              <Swatch
                key={item.value}
                color={item.value}
                label={item.label}
                active={state?.highlight === item.value}
                onClick={() => pickHighlight(item.value)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
