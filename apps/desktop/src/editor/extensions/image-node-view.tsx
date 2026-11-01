import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Scaling,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useEditorImage } from "../image-context";

type Align = "left" | "center" | "right";
type ResizeSide = "nw" | "ne" | "sw" | "se";

const ALIGNMENTS: { value: Align; label: string; icon: LucideIcon }[] = [
  { value: "left", label: "左对齐", icon: AlignLeft },
  { value: "center", label: "居中", icon: AlignCenter },
  { value: "right", label: "右对齐", icon: AlignRight },
];

const WIDTH_PRESETS = [25, 50, 75, 100] as const;

function widthToCss(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}px`;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "fit-content";
}

function alignmentOf(value: unknown): Align {
  return value === "left" || value === "right" ? value : "center";
}

function justifyOf(align: Align): string {
  return align === "left"
    ? "flex-start"
    : align === "right"
      ? "flex-end"
      : "center";
}

/** 图片节点：对齐、四角拖拽缩放、宽度预设、alt 与删除；交互参考 ImagePlus */
export function ImageNodeView({
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
  deleteNode,
}: ReactNodeViewProps) {
  const { resolveSrc } = useEditorImage();
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [liveWidth, setLiveWidth] = useState<string | null>(null);
  const [altOpen, setAltOpen] = useState(false);
  const [altDraft, setAltDraft] = useState("");

  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
  const align = alignmentOf(node.attrs.align);
  const widthStyle = liveWidth ?? widthToCss(node.attrs.width);
  const isFitContent = widthStyle === "fit-content";

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    [],
  );

  const selectImage = () => {
    const pos = getPos();
    if (typeof pos === "number") {
      editor.chain().focus().setNodeSelection(pos).run();
    }
  };

  const setAlign = (next: Align) => {
    updateAttributes({ align: next });
  };

  const setWidth = (width: string | null) => {
    updateAttributes({ width });
  };

  const saveAlt = () => {
    updateAttributes({ alt: altDraft });
    setAltOpen(false);
  };

  const beginResize = (side: ResizeSide, startX: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const wrapperWidth =
      container.parentElement?.getBoundingClientRect().width ??
      container.getBoundingClientRect().width;
    const startWidth = container.getBoundingClientRect().width;
    if (wrapperWidth <= 0 || startWidth <= 0) return null;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    let lastPercent = Math.max(
      10,
      Math.min(100, Math.round((startWidth / wrapperWidth) * 100)),
    );
    let moved = false;

    return {
      update(clientX: number) {
        moved = true;
        const deltaX = clientX - startX;
        const direction = side.includes("w") ? -1 : 1;
        const nextWidth = Math.min(
          wrapperWidth,
          Math.max(60, startWidth + deltaX * direction),
        );
        lastPercent = Math.max(
          10,
          Math.min(100, Math.round((nextWidth / wrapperWidth) * 100)),
        );
        setLiveWidth(`${lastPercent}%`);
      },
      finish() {
        document.body.style.userSelect = previousUserSelect;
        setLiveWidth(null);
        if (moved) {
          updateAttributes({ width: `${lastPercent}%` });
        }
      },
      cancel() {
        document.body.style.userSelect = previousUserSelect;
        setLiveWidth(null);
      },
    };
  };

  const startMouseResize = (
    event: ReactMouseEvent<HTMLSpanElement>,
    side: ResizeSide,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const session = beginResize(side, event.clientX);
    if (!session) return;

    const onMove = (moveEvent: MouseEvent) => session.update(moveEvent.clientX);
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      resizeCleanupRef.current = null;
    };
    const onUp = () => {
      cleanup();
      session.finish();
    };
    resizeCleanupRef.current = () => {
      cleanup();
      session.cancel();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const startTouchResize = (
    event: ReactTouchEvent<HTMLSpanElement>,
    side: ResizeSide,
  ) => {
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    const session = beginResize(side, touch.clientX);
    if (!session) return;

    const onMove = (moveEvent: TouchEvent) => {
      const nextTouch = moveEvent.touches[0];
      if (!nextTouch) return;
      moveEvent.preventDefault();
      session.update(nextTouch.clientX);
    };
    const cleanup = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("touchcancel", onUp);
      resizeCleanupRef.current = null;
    };
    const onUp = () => {
      cleanup();
      session.finish();
    };
    resizeCleanupRef.current = () => {
      cleanup();
      session.cancel();
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
    document.addEventListener("touchcancel", onUp);
  };

  return (
    <NodeViewWrapper
      as="div"
      className="image-node-view my-3 flex w-full"
      style={{ justifyContent: justifyOf(align) }}
      data-align={align}
      contentEditable={false}
    >
      <div
        ref={containerRef}
        className={cn(
          "relative max-w-full",
          selected &&
            "ring-2 ring-primary/35 ring-offset-2 ring-offset-background",
        )}
        style={{ width: widthStyle }}
        onClick={selectImage}
      >
        <img
          src={resolveSrc(src)}
          alt={alt}
          title={title}
          draggable={false}
          className="block h-auto max-w-full rounded-sm"
          style={isFitContent ? undefined : { width: "100%" }}
        />

        {selected ? (
          <div
            data-image-ui
            role="toolbar"
            aria-label="图片工具"
            className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-pop"
            onMouseDown={(event) => event.preventDefault()}
          >
            {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="icon-xs"
                title={label}
                aria-label={label}
                aria-pressed={align === value}
                onClick={() => setAlign(value)}
                className={cn(
                  "text-foreground",
                  align === value &&
                    "bg-accent text-accent-foreground hover:bg-accent",
                )}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}

            <Separator orientation="vertical" className="mx-1 h-4" />

            <DropdownMenu>
              <DropdownMenuTrigger
                title="图片宽度"
                aria-label="图片宽度"
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Scaling className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-32">
                {WIDTH_PRESETS.map((percent) => (
                  <DropdownMenuItem
                    key={percent}
                    onClick={() => setWidth(`${percent}%`)}
                  >
                    {percent}%
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setWidth(null)}>
                  适应内容
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover
              open={altOpen}
              onOpenChange={(open) => {
                setAltOpen(open);
                if (open) setAltDraft(alt);
              }}
            >
              <PopoverTrigger
                title="替代文本"
                aria-label="替代文本"
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Type className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent align="center" className="w-64 p-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={altDraft}
                    onChange={(event) => setAltDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveAlt();
                    }}
                    placeholder="图片替代文本"
                    aria-label="图片替代文本"
                    className="h-7 text-xs"
                    autoFocus
                  />
                  <Button type="button" size="xs" onClick={saveAlt}>
                    保存
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="mx-1 h-4" />

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title="删除图片"
              aria-label="删除图片"
              onClick={() => deleteNode()}
              className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ) : null}

        {selected
          ? (["nw", "ne", "sw", "se"] as const).map((side) => (
              <span
                key={side}
                data-image-ui
                data-resize-handle={side}
                onMouseDown={(event) => startMouseResize(event, side)}
                onTouchStart={(event) => startTouchResize(event, side)}
                className={cn(
                  "absolute z-30 size-2.5 touch-none rounded-full border-2 border-primary bg-background shadow-sm",
                  side.includes("n") ? "-top-1" : "-bottom-1",
                  side.includes("w") ? "-left-1" : "-right-1",
                  side === "nw" || side === "se"
                    ? "cursor-nwse-resize"
                    : "cursor-nesw-resize",
                )}
              />
            ))
          : null}
      </div>
    </NodeViewWrapper>
  );
}
