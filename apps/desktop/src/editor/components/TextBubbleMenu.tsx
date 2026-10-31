import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { LinkDialog } from "./LinkDialog";

const bubbleClass =
  "flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-pop";
const activeClass =
  "bg-accent text-primary hover:bg-accent hover:text-primary";

function MarkButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("text-foreground", active && activeClass)}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

export function TextBubbleMenu({ editor }: { editor: Editor | null }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            underline: e.isActive("underline"),
            code: e.isActive("code"),
            href: (e.getAttributes("link").href as string | undefined) ?? "",
          }
        : null,
  });

  if (!editor) return null;

  const openLink = () => {
    const { from, to } = editor.state.selection;
    rangeRef.current = { from, to };
    setLinkHref(state?.href ?? "");
    setLinkOpen(true);
  };

  const applyLink = (href: string | null) => {
    setLinkOpen(false);
    const range = rangeRef.current;
    if (!range) return;
    const chain = editor.chain().focus().setTextSelection(range);
    if (href) {
      chain.extendMarkRange("link").setLink({ href }).run();
    } else {
      chain.extendMarkRange("link").unsetLink().run();
    }
  };

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="textBubble"
        options={{ placement: "top", offset: 8 }}
        shouldShow={({ state: editorState, editor: current }) =>
          current.isEditable &&
          !editorState.selection.empty &&
          !(editorState.selection instanceof NodeSelection)
        }
      >
        <div className={bubbleClass}>
          <MarkButton
            label="加粗"
            icon={Bold}
            active={state?.bold ?? false}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <MarkButton
            label="斜体"
            icon={Italic}
            active={state?.italic ?? false}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <MarkButton
            label="删除线"
            icon={Strikethrough}
            active={state?.strike ?? false}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <MarkButton
            label="下划线"
            icon={Underline}
            active={state?.underline ?? false}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <MarkButton
            label="行内代码"
            icon={Code}
            active={state?.code ?? false}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <Separator orientation="vertical" className="mx-1 self-stretch" />
          <MarkButton
            label="链接"
            icon={LinkIcon}
            active={Boolean(state?.href)}
            onClick={openLink}
          />
        </div>
      </BubbleMenu>
      <LinkDialog
        open={linkOpen}
        initialHref={linkHref}
        onOpenChange={setLinkOpen}
        onApply={applyLink}
      />
    </>
  );
}
