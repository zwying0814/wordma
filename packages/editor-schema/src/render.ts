import { renderToHTMLString } from "@tiptap/static-renderer";
import type { JSONContent } from "@tiptap/core";
import { createSchemaExtensions } from "./extensions";

const extensions = createSchemaExtensions();

/** Tiptap JSON → 发布用 HTML（与编辑器同一套扩展定义） */
export function renderToHTML(doc: JSONContent): string {
  return renderToHTMLString({ content: doc, extensions });
}
