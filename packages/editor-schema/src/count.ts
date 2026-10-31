import type { JSONContent } from "@tiptap/core";

/** 与编辑器 doc.textContent 一致：只统计文本节点，忽略空白 */
export function countWords(doc: JSONContent): number {
  let text = "";

  const walk = (node: JSONContent) => {
    if (node.type === "text" && typeof node.text === "string") {
      text += node.text;
    }
    for (const child of node.content ?? []) {
      walk(child);
    }
  };

  walk(doc);
  return text.replace(/\s/g, "").length;
}
