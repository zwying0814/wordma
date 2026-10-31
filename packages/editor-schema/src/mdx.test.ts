import { describe, expect, test } from "bun:test";
import { countWords } from "./count";
import { createMdxBlockId, DEFAULT_MDX_SOURCE } from "./mdx";
import { renderToHTML } from "./render";

const doc = (content: unknown[]) => ({ type: "doc", content }) as never;

describe("mdxBlock", () => {
  test("countWords 不计 MDX 源码", () => {
    const json = doc([
      {
        type: "paragraph",
        content: [{ type: "text", text: "你好 世界" }],
      },
      {
        type: "mdxBlock",
        attrs: { blockId: "mdx_1", source: "const a = 1" },
      },
    ]);
    expect(countWords(json)).toBe(4);
  });

  test("静态渲染输出占位且不泄漏源码", () => {
    const source = "# 不应出现在 HTML 里";
    const html = renderToHTML(
      doc([
        {
          type: "mdxBlock",
          attrs: { blockId: "mdx_1", source },
        },
      ]),
    );
    expect(html).toContain('data-wordma-mdx="mdx_1"');
    expect(html).toContain("MDX 内容需要 JavaScript");
    expect(html).not.toContain(source);
  });

  test("发布映射可以覆盖占位输出", () => {
    const html = renderToHTML(
      doc([{ type: "mdxBlock", attrs: { blockId: "mdx_9", source: "x" } }]),
      { mdx: (node) => `<section data-entry="${node.attrs.blockId}"></section>` },
    );
    expect(html).toBe('<section data-entry="mdx_9"></section>');
  });

  test("blockId 唯一且带前缀", () => {
    const ids = new Set(Array.from({ length: 20 }, createMdxBlockId));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id.startsWith("mdx_")).toBe(true);
  });

  test("默认示例可被编译前校验接受（非空、有限长）", () => {
    expect(DEFAULT_MDX_SOURCE.length).toBeGreaterThan(0);
    expect(DEFAULT_MDX_SOURCE.length).toBeLessThan(128 * 1024);
  });
});
