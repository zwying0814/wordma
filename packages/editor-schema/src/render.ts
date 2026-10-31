import { renderToHTMLString } from "@tiptap/static-renderer";
import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { common, createLowlight } from "lowlight";
import { createSchemaExtensions } from "./extensions";

const extensions = createSchemaExtensions();
const lowlight = createLowlight(common);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function hastToHtml(node: any): string {
  if (!node) return "";
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "root") {
    return (node.children ?? []).map(hastToHtml).join("");
  }
  if (node.type === "element") {
    const properties = node.properties ?? {};
    const attrs = Object.entries(properties)
      .map(([key, value]) => {
        if (value == null || value === false) return "";
        const name = key === "className" ? "class" : key;
        const text = Array.isArray(value) ? value.join(" ") : String(value);
        return ` ${name}="${escapeAttr(text)}"`;
      })
      .join("");
    const children = (node.children ?? []).map(hastToHtml).join("");
    return `<${node.tagName}${attrs}>${children}</${node.tagName}>`;
  }
  return "";
}

function renderCodeBlock(node: PMNode): string {
  const attrs = node.attrs as Record<string, unknown>;
  const language =
    typeof attrs.language === "string" && attrs.language
      ? attrs.language
      : "plaintext";
  const code = node.textContent;

  let highlighted: string;
  try {
    highlighted = hastToHtml(lowlight.highlight(language, code));
  } catch {
    highlighted = escapeHtml(code);
  }
  return `<pre><code class="language-${escapeAttr(language)} hljs">${highlighted}</code></pre>`;
}

/** Tiptap JSON → 发布用 HTML（与编辑器同一套扩展定义） */
export function renderToHTML(doc: JSONContent): string {
  return renderToHTMLString({
    content: doc,
    extensions,
    options: {
      nodeMapping: {
        codeBlock: ({ node }) => renderCodeBlock(node),
      },
    },
  });
}
