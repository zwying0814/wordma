import type { JSONContent } from "@wordma/editor-schema";

export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** 正文一律是 Tiptap JSON；解析失败时回退空文档并返回错误文案（保存会被阻止） */
export function parseInitialContent(content: string): {
  value: JSONContent;
  error: string | null;
} {
  try {
    const parsed = JSON.parse(content) as JSONContent;
    if (parsed.type !== "doc") {
      throw new Error("缺少 doc 根节点");
    }
    return { value: parsed, error: null };
  } catch (e) {
    return { value: EMPTY_DOC, error: `正文 JSON 解析失败：${String(e)}` };
  }
}
