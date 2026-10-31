import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JSONContent } from "@wordma/editor-schema";
import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";

/** 与前端 MDX_SOURCE_LIMIT / Rust 校验保持一致 */
const SOURCE_LIMIT = 128 * 1024;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const CACHE_LIMIT = 20;

export interface MdxDiagnostic {
  message: string;
  line?: number;
  column?: number;
  frame?: string;
}

export interface MdxCompileResult {
  ok: boolean;
  hash?: string;
  code?: string;
  css?: string;
  error?: MdxDiagnostic;
}

export interface MdxCompileOptions {
  /** 站点 MDX 工作区；临时文件与依赖解析都基于它 */
  workspace: string;
  blockId?: string;
  /** React 运行时地址；发布与预览共用 /assets/mdx/react.js */
  runtimeUrl?: string;
}

const ENTRY_SOURCE = [
  'import Content from "./block.js";',
  'import { createElement } from "react";',
  'import { createRoot } from "react-dom/client";',
  "",
  "export function mount(el) {",
  "  const root = createRoot(el);",
  "  root.render(createElement(Content));",
  "  return () => root.unmount();",
  "}",
  "",
].join("\n");

const cache = new Map<string, MdxCompileResult>();

export interface MdxOccurrence {
  blockId: string;
  source: string;
}

/** 按文档顺序收集 mdxBlock（发布渲染与字数校验共用同一遍历口径） */
export function collectMdxBlocks(doc: JSONContent): MdxOccurrence[] {
  const blocks: MdxOccurrence[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "mdxBlock") {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>;
      blocks.push({
        blockId: typeof attrs.blockId === "string" ? attrs.blockId : "",
        source: typeof attrs.source === "string" ? attrs.source : "",
      });
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return blocks;
}

export const MDX_RUNTIME_URL = "/assets/mdx/react.js";

export function mdxAssetPaths(hash: string): { js: string; css: string } {
  return {
    js: `assets/mdx/entry-${hash}.js`,
    css: `assets/mdx/entry-${hash}.css`,
  };
}

function sourceHash(source: string, workspace: string): string {
  return createHash("sha256")
    .update(source)
    .update("\0")
    .update(workspace)
    .digest("hex");
}

function remember(hash: string, result: MdxCompileResult) {
  cache.delete(hash);
  cache.set(hash, result);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function fail(error: MdxDiagnostic): MdxCompileResult {
  return { ok: false, error };
}

function formatCompileError(error: unknown): MdxDiagnostic {
  const value = error as {
    reason?: string;
    message?: string;
    line?: number;
    column?: number;
    place?: { start?: { line?: number; column?: number } };
    frame?: string;
    stack?: string;
  };
  return {
    message: value.reason ?? value.message ?? String(error),
    line: value.line ?? value.place?.start?.line,
    column: value.column ?? value.place?.start?.column,
    frame: value.frame,
  };
}

function formatBuildError(logs: unknown[]): MdxDiagnostic {
  const messages = logs.map((log) => {
    const item = log as {
      message?: string;
      position?: { line?: number; column?: number };
    };
    return item.message ?? String(log);
  });
  const first = logs[0] as
    | { position?: { line?: number; column?: number } }
    | undefined;
  return {
    message: messages.join("\n") || "MDX 打包失败",
    line: first?.position?.line,
    column: first?.position?.column,
  };
}

/**
 * 单块 MDX → 浏览器 ESM（React external）。
 * 结果按源码 + 工作区缓存；失败不缓存。
 */
export async function compileMdxBlock(
  source: string,
  options: MdxCompileOptions,
): Promise<MdxCompileResult> {
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > SOURCE_LIMIT) {
    return fail({
      message: `MDX 源码超过 ${SOURCE_LIMIT / 1024} KB 上限`,
    });
  }

  const hash = sourceHash(source, options.workspace);
  const cached = cache.get(hash);
  if (cached) {
    cache.delete(hash);
    cache.set(hash, cached);
    return cached;
  }

  let compiled: string;
  try {
    const result = await compile(source, {
      outputFormat: "program",
      jsx: false,
      development: false,
      remarkPlugins: [remarkGfm],
    });
    compiled = String(result);
  } catch (error) {
    return fail(formatCompileError(error));
  }

  const tempDir = join(
    options.workspace,
    ".wordma-compile",
    `${hash}-${crypto.randomUUID()}`,
  );
  const outDir = join(tempDir, "out");
  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(tempDir, "block.js"), compiled, "utf8");
    await writeFile(join(tempDir, "entry.js"), ENTRY_SOURCE, "utf8");

    const build = await Bun.build({
      entrypoints: [join(tempDir, "entry.js")],
      outdir: outDir,
      target: "browser",
      format: "esm",
      plugins: [
        {
          name: "mdx-react-runtime",
          setup(builder) {
            builder.onResolve(
              { filter: /^(react|react-dom)(\/|$)/ },
              () => ({
                path: options.runtimeUrl ?? MDX_RUNTIME_URL,
                external: true,
              }),
            );
          },
        },
      ],
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      minify: true,
      naming: "[name].[ext]",
      throw: false,
    });

    if (!build.success) {
      return fail(formatBuildError(build.logs));
    }

    const code = await Bun.file(join(outDir, "entry.js")).text();
    const cssFile = Bun.file(join(outDir, "entry.css"));
    const css = (await cssFile.exists()) ? await cssFile.text() : undefined;
    const total = Buffer.byteLength(code, "utf8") + (css ? Buffer.byteLength(css, "utf8") : 0);
    if (total > OUTPUT_LIMIT) {
      return fail({
        message: `MDX 产物超过 ${OUTPUT_LIMIT / 1024 / 1024} MB 上限`,
      });
    }

    const result: MdxCompileResult = { ok: true, hash, code, css };
    remember(hash, result);
    return result;
  } catch (error) {
    return fail({
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
