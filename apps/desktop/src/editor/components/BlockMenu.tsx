import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode, NodeType } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { createMdxBlockId } from "@wordma/editor-schema";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  MoreHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NODE_LABELS: Record<string, string> = {
  paragraph: "正文",
  heading: "标题",
  bulletList: "无序列表",
  orderedList: "有序列表",
  blockquote: "引用",
  codeBlock: "代码块",
  image: "图片",
  table: "表格",
  mdxBlock: "MDX",
  horizontalRule: "分割线",
};

const HEADING_LEVELS = [1, 2, 3] as const;

function describeNode(node: PMNode): string {
  const label = NODE_LABELS[node.type.name] ?? node.type.name;
  if (node.type.name === "heading") {
    return `${label} ${node.attrs.level ?? 1}`;
  }
  return label;
}

function rangeAt(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos);
  const depth = $pos.depth;
  const parent = $pos.parent;
  const index = $pos.index(depth);
  if (index >= parent.childCount) return null;
  let start = $pos.start(depth);
  for (let i = 0; i < index; i += 1) {
    start += parent.child(i).nodeSize;
  }
  return { parent, index, node: parent.child(index), start };
}

function attrsFor(type: NodeType, source: PMNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const name of Object.keys(type.spec.attrs ?? {})) {
    if (source.attrs[name] !== undefined) attrs[name] = source.attrs[name];
  }
  return attrs;
}

interface DragBlock {
  index: number;
  pos: number;
  node: PMNode;
  rect: DOMRect;
  element: HTMLElement;
}

/** 顶层块及其屏幕位置；拖动只调整顶层顺序，与 DragHandle 的 targeting 一致 */
function topLevelBlocks(editor: Editor): DragBlock[] {
  const blocks: DragBlock[] = [];
  editor.state.doc.forEach((node, offset, index) => {
    const dom = editor.view.nodeDOM(offset);
    const element =
      dom instanceof HTMLElement
        ? dom
        : dom?.parentElement instanceof HTMLElement
          ? dom.parentElement
          : null;
    if (!element) return;
    blocks.push({
      index,
      pos: offset,
      node,
      rect: element.getBoundingClientRect(),
      element,
    });
  });
  return blocks;
}

export function BlockMenu({
  editor,
  target,
  onOpenChange,
  onHandleHoverChange,
}: {
  editor: Editor;
  target: { node: PMNode; pos: number } | null;
  onOpenChange: (open: boolean) => void;
  onHandleHoverChange?: (hovered: boolean) => void;
}) {
  const range = target ? rangeAt(editor, target.pos) : null;
  const node = range?.node ?? target?.node ?? null;
  const isTextblock =
    node?.type.name === "paragraph" || node?.type.name === "heading";

  const run = (fn: (range: NonNullable<ReturnType<typeof rangeAt>>) => void) => {
    if (!range) return;
    fn(range);
  };

  const move = (direction: -1 | 1) => {
    run(({ parent, index, node: current, start }) => {
      if (direction === -1 && index === 0) return;
      if (direction === 1 && index >= parent.childCount - 1) return;
      const tr = editor.state.tr;
      if (direction === -1) {
        const prev = parent.child(index - 1);
        tr.replaceWith(
          start - prev.nodeSize,
          start + current.nodeSize,
          Fragment.fromArray([current, prev]),
        );
      } else {
        const next = parent.child(index + 1);
        tr.replaceWith(
          start,
          start + current.nodeSize + next.nodeSize,
          Fragment.fromArray([next, current]),
        );
      }
      editor.view.dispatch(tr.scrollIntoView());
    });
  };

  const duplicate = () => {
    run(({ node: current, start }) => {
      const clone =
        current.type.name === "mdxBlock"
          ? current.type.create(
              { ...current.attrs, blockId: createMdxBlockId() },
              current.content,
              current.marks,
            )
          : current;
      const tr = editor.state.tr.insert(start + current.nodeSize, clone);
      editor.view.dispatch(tr.scrollIntoView());
    });
  };

  const remove = () => {
    run(({ parent, node: current, start }) => {
      const tr = editor.state.tr;
      if (parent.childCount === 1) {
        const paragraph = editor.schema.nodes.paragraph.createAndFill();
        if (paragraph) {
          tr.replaceWith(start, start + current.nodeSize, paragraph);
        }
      } else {
        tr.delete(start, start + current.nodeSize);
      }
      editor.view.dispatch(tr.scrollIntoView());
    });
  };

  const convert = (type: NodeType, extra?: Record<string, unknown>) => {
    run(({ node: current, start }) => {
      const tr = editor.state.tr.setNodeMarkup(start, type, {
        ...attrsFor(type, current),
        ...extra,
      });
      editor.view.dispatch(tr.scrollIntoView());
    });
  };

  const [dragging, setDragging] = useState(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 关闭浏览器原生 HTML5 拖拽，统一走自定义 pointer 重排
  useEffect(() => {
    const handle = rootRef.current?.closest("[draggable]");
    if (!handle) return;
    const preventNativeDrag = (event: Event) => event.preventDefault();
    handle.addEventListener("dragstart", preventNativeDrag);
    return () => handle.removeEventListener("dragstart", preventNativeDrag);
  }, []);

  useEffect(
    () => () => {
      cleanupDragRef.current?.();
    },
    [],
  );

  /** 顶层块拖动：不依赖浏览器 HTML5 DnD，pointer 移动后直接重排事务 */
  const startDrag = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !target) return;
    const blocks = topLevelBlocks(editor);
    const sourceIndex = blocks.findIndex((block) => block.pos === target.pos);
    if (sourceIndex < 0) return;

    event.preventDefault();
    event.stopPropagation();

    const source = blocks[sourceIndex];
    const indicator = document.createElement("div");
    Object.assign(indicator.style, {
      position: "fixed",
      height: "2px",
      borderRadius: "999px",
      background: "var(--primary)",
      boxShadow: "0 0 0 2px var(--background)",
      zIndex: "9999",
      pointerEvents: "none",
      display: "none",
    });
    document.body.appendChild(indicator);

    const previousOpacity = source.element.style.opacity;
    const previousCursor = document.body.style.cursor;
    source.element.style.opacity = "0.45";
    document.body.style.cursor = "grabbing";
    setDragging(true);

    let insertion = sourceIndex;
    let canDrop = false;

    const onMove = (moveEvent: MouseEvent) => {
      let next = blocks.length;
      for (const block of blocks) {
        if (moveEvent.clientY < block.rect.top + block.rect.height / 2) {
          next = block.index;
          break;
        }
      }
      insertion = next;
      canDrop = next !== sourceIndex && next !== sourceIndex + 1;
      if (!canDrop) {
        indicator.style.display = "none";
        return;
      }
      const targetBlock =
        next < blocks.length ? blocks[next] : blocks[blocks.length - 1];
      const left = Math.min(source.rect.left, targetBlock.rect.left);
      const right = Math.max(source.rect.right, targetBlock.rect.right);
      indicator.style.display = "block";
      indicator.style.left = `${left}px`;
      indicator.style.top = `${
        next < blocks.length
          ? targetBlock.rect.top - 2
          : targetBlock.rect.bottom + 1
      }px`;
      indicator.style.width = `${right - left}px`;
    };

    const onFinish = () => {
      const shouldMove = canDrop;
      const targetPos =
        insertion < blocks.length
          ? blocks[insertion].pos
          : editor.state.doc.content.size;
      finish();
      if (!shouldMove) return;

      const tr = editor.state.tr.delete(
        source.pos,
        source.pos + source.node.nodeSize,
      );
      const mapped = tr.mapping.map(targetPos);
      tr.insert(mapped, source.node);
      tr.setSelection(NodeSelection.create(tr.doc, mapped));
      editor.view.dispatch(tr.scrollIntoView());
    };

    const finish = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onFinish);
      indicator.remove();
      source.element.style.opacity = previousOpacity;
      document.body.style.cursor = previousCursor;
      setDragging(false);
      cleanupDragRef.current = null;
    };

    cleanupDragRef.current = finish;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onFinish);
  };

  return (
    <div
      ref={rootRef}
      className="flex items-center gap-0"
      onMouseEnter={() => onHandleHoverChange?.(true)}
      onMouseLeave={() => onHandleHoverChange?.(false)}
      onMouseDown={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("[data-block-menu-trigger]")
        ) {
          return;
        }
        startDrag(event);
      }}
    >
      <span
        title="拖动排序"
        aria-hidden
        className={cn(
          "flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing",
          dragging && "cursor-grabbing text-primary",
        )}
      >
        <GripVertical className="size-3.5" />
      </span>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          title="块操作"
          aria-label="块操作"
          data-block-menu-trigger
          className="flex h-6 w-4 items-center justify-center rounded-sm text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground data-[popup-open]:bg-muted data-[popup-open]:text-muted-foreground"
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{node ? describeNode(node) : "块"}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!range || range.index === 0}
              onClick={() => move(-1)}
            >
              <ArrowUp className="size-3.5" />
              上移
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!range || range.index >= range.parent.childCount - 1}
              onClick={() => move(1)}
            >
              <ArrowDown className="size-3.5" />
              下移
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!range} onClick={duplicate}>
              <Copy className="size-3.5" />
              复制块
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {isTextblock ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>转为</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => convert(editor.schema.nodes.paragraph)}
                >
                  <Type className="size-3.5" />
                  正文
                </DropdownMenuItem>
                {HEADING_LEVELS.map((level) => (
                  <DropdownMenuItem
                    key={level}
                    onClick={() =>
                      convert(editor.schema.nodes.heading, { level })
                    }
                  >
                    <span className="flex size-3.5 items-center justify-center text-[9px] font-semibold">
                      H{level}
                    </span>
                    标题 {level}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!range}
            onClick={remove}
          >
            <Trash2 className="size-3.5" />
            删除块
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
