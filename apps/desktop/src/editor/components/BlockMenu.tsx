import type { Editor } from "@tiptap/react";
import type { Node as PMNode, NodeType } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
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

const NODE_LABELS: Record<string, string> = {
  paragraph: "正文",
  heading: "标题",
  bulletList: "无序列表",
  orderedList: "有序列表",
  blockquote: "引用",
  codeBlock: "代码块",
  image: "图片",
  table: "表格",
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

export function BlockMenu({
  editor,
  target,
  onOpenChange,
}: {
  editor: Editor;
  target: { node: PMNode; pos: number } | null;
  onOpenChange: (open: boolean) => void;
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
      const tr = editor.state.tr.insert(start + current.nodeSize, current);
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

  return (
    <div className="flex items-center gap-0">
      <span
        title="拖动排序"
        aria-hidden
        className="flex h-6 w-4 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </span>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          title="块操作"
          aria-label="块操作"
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
