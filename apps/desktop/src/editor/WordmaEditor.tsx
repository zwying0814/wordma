import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { JSONContent } from "@wordma/editor-schema";
import {
  countWords,
  createSchemaExtensions,
} from "@wordma/editor-schema";
import { Markdown } from "@tiptap/markdown";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { BlockMenu } from "./components/BlockMenu";
import { EditorToolbar } from "./components/EditorToolbar";
import { ImageBubbleMenu } from "./components/ImageBubbleMenu";
import { TableBubbleMenu } from "./components/TableBubbleMenu";
import { TextBubbleMenu } from "./components/TextBubbleMenu";
import { SlashCommand } from "./extensions/SlashCommand";
import { createImageNodeView } from "./extensions/image-node-view";
import {
  fixMarkdownTables,
  looksLikeMarkdown,
} from "./lib/markdown-paste";
import type { EditorSnapshot } from "./types";
import "./editor.css";

export interface WordmaEditorHandle {
  getSnapshot: () => EditorSnapshot | null;
}

export interface WordmaEditorProps {
  /** Tiptap JSON 文档 */
  initialContent: JSONContent;
  placeholder?: string;
  onChange?: (snapshot: EditorSnapshot) => void;
  onReady?: () => void;
  onPasteImage?: (file: File) => Promise<string | null>;
  onPickImage?: () => Promise<string | null>;
  onResolveImageUrl?: (src: string) => string;
  className?: string;
}

export const WordmaEditor = forwardRef<WordmaEditorHandle, WordmaEditorProps>(
  function WordmaEditor(
    {
      initialContent,
      placeholder,
      onChange,
      onReady,
      onPasteImage,
      onPickImage,
      onResolveImageUrl,
      className,
    },
    ref,
  ) {
    const pasteRef = useRef(onPasteImage);
    pasteRef.current = onPasteImage;
    const resolveRef = useRef(onResolveImageUrl);
    resolveRef.current = onResolveImageUrl;
    const changeRef = useRef(onChange);
    changeRef.current = onChange;
    const readyRef = useRef(onReady);
    readyRef.current = onReady;
    const [blockTarget, setBlockTarget] = useState<{
      node: PMNode;
      pos: number;
    } | null>(null);
    const blockMenuOpenRef = useRef(false);

    const extensions = useMemo(
      () => [
        ...createSchemaExtensions({
          placeholder,
          imageNodeView: () => (props) =>
            createImageNodeView({
              node: props.node,
              editor: props.editor,
              getPos: props.getPos,
              resolveSrc: (src) => resolveRef.current?.(src) ?? src,
            }),
        }),
        Markdown,
        SlashCommand,
      ],
      [placeholder],
    );

    const editor = useEditor({
      extensions,
      content: initialContent,
      editorProps: {
        attributes: {
          class: "tiptap ProseMirror wm-editor",
        },
        handlePaste: (_view, event) => {
          const clipboard = event.clipboardData;

          const files = Array.from(clipboard?.files ?? []).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length > 0 && pasteRef.current) {
            event.preventDefault();
            for (const file of files) {
              void pasteRef.current(file).then((url) => {
                if (url && editor) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
              });
            }
            return true;
          }

          const text = clipboard?.getData("text/plain") ?? "";
          if (text && looksLikeMarkdown(text)) {
            const manager = editor?.markdown;
            if (manager) {
              event.preventDefault();
              const doc = manager.parse(fixMarkdownTables(text));
              editor.chain().focus().insertContent(doc.content ?? []).run();
              return true;
            }
          }

          return false;
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (moved) return false;
          const files = Array.from(event.dataTransfer?.files ?? []).filter(
            (file) => file.type.startsWith("image/"),
          );
          if (files.length === 0 || !pasteRef.current) return false;
          event.preventDefault();
          for (const file of files) {
            void pasteRef.current(file).then((url) => {
              if (url && editor) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            });
          }
          return true;
        },
      },
      onCreate() {
        readyRef.current?.();
      },
      onUpdate({ editor: current }) {
        const json = current.getJSON();
        changeRef.current?.({ json, wordCount: countWords(json) });
      },
    });

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot: () => {
          if (!editor) return null;
          const json = editor.getJSON();
          return { json, wordCount: countWords(json) };
        },
      }),
      [editor],
    );

    return (
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${className ?? ""}`}>
        <EditorToolbar editor={editor} onPickImage={onPickImage} />
        {editor ? (
          <>
            <TextBubbleMenu editor={editor} />
            <ImageBubbleMenu editor={editor} />
            <TableBubbleMenu editor={editor} />
          </>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
        {editor ? (
          <DragHandle
            editor={editor}
            onNodeChange={({ node, pos }) => {
              if (blockMenuOpenRef.current) return;
              setBlockTarget(node ? { node, pos } : null);
            }}
            className="flex h-6 items-center rounded-sm text-muted-foreground/50"
          >
            <BlockMenu
              editor={editor}
              target={blockTarget}
              onOpenChange={(open) => {
                blockMenuOpenRef.current = open;
                if (!open) setBlockTarget(null);
              }}
            />
          </DragHandle>
        ) : null}
      </div>
    );
  },
);
