import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileMdxBlock, collectMdxBlocks } from "./mdx";
import type { JSONContent } from "@wordma/editor-schema";

const doc = (content: unknown[]) => ({ type: "doc", content }) as JSONContent;

describe("mdx compiler", () => {
  test("collectMdxBlocks 按文档顺序收集", () => {
    const blocks = collectMdxBlocks(
      doc([
        { type: "paragraph" },
        { type: "mdxBlock", attrs: { blockId: "a", source: "A" } },
        {
          type: "blockquote",
          content: [
            { type: "mdxBlock", attrs: { blockId: "b", source: "B" } },
          ],
        },
      ]),
    );
    expect(blocks).toEqual([
      { blockId: "a", source: "A" },
      { blockId: "b", source: "B" },
    ]);
  });

  test("编译为 ESM 并引用共享运行时", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "wordma-mdx-test-"));
    try {
      const result = await compileMdxBlock("## 你好\n\n<button>ok</button>", {
        workspace,
      });
      expect(result.ok).toBe(true);
      expect(result.hash).toHaveLength(64);
      expect(result.code).toContain("/assets/mdx/react.js");
      expect(result.code).toContain("mount");
      expect(result.css).toBeUndefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("语法错误返回行列号", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "wordma-mdx-test-"));
    try {
      const result = await compileMdxBlock("# 标题\n\n<", { workspace });
      expect(result.ok).toBe(false);
      expect(result.error?.message).toBeTruthy();
      expect(result.error?.line).toBe(3);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
