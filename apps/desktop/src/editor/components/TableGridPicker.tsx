import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Table } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX = 6;

export function TableGridPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 0, cols: 0 });

  const rows = hover.rows || 3;
  const cols = hover.cols || 3;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="插入表格"
        title="插入表格"
        className={cn(
          "flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted",
          open && "bg-accent text-accent-foreground",
        )}
      >
        <Table className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="mb-1.5 text-xs text-muted-foreground">
          {rows} × {cols}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: MAX * MAX }, (_, index) => {
            const r = Math.floor(index / MAX) + 1;
            const c = (index % MAX) + 1;
            const active = r <= rows && c <= cols;
            return (
              <button
                key={index}
                type="button"
                aria-label={`插入 ${r} 行 ${c} 列表格`}
                onMouseEnter={() => setHover({ rows: r, cols: c })}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: r, cols: c, withHeaderRow: true })
                    .run();
                  setOpen(false);
                  setHover({ rows: 0, cols: 0 });
                }}
                className={cn(
                  "size-4 rounded-[3px] border border-border transition-colors",
                  active ? "bg-primary" : "bg-background hover:bg-muted",
                )}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
