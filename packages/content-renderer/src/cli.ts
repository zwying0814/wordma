import { renderToHTML, type JSONContent } from "@wordma/editor-schema";
import {
  compileMdxBlock,
  collectMdxBlocks,
  MDX_RUNTIME_URL,
  mdxAssetPaths,
  type MdxCompileResult,
} from "./mdx";

interface RenderInput {
  kind: "article" | "page";
  id: number;
  content: string;
}

interface RenderRequest {
  workspace: string;
  runtimePath?: string;
  items: RenderInput[];
}

interface RenderItem {
  kind: "article" | "page";
  id: number;
  ok: boolean;
  html?: string;
  feedHtml?: string;
  error?: string;
}

interface RenderAsset {
  path: string;
  contents: string;
}

interface RenderWarning {
  kind: "article" | "page";
  id: number;
  blockId?: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function errorBlock(message: string): string {
  return `<div class="wordma-mdx wordma-mdx-error"><p>MDX 编译失败：${escapeHtml(
    message,
  )}</p></div>`;
}

function renderBlock(
  item: RenderInput,
  index: number,
  compiled: MdxCompileResult | undefined,
): string {
  if (!compiled || !compiled.ok || !compiled.hash) {
    return errorBlock(compiled?.error?.message ?? "MDX 编译失败");
  }
  const key = `${item.kind}-${item.id}-${index}`;
  const asset = mdxAssetPaths(compiled.hash);
  const css = compiled.css
    ? `<link rel="stylesheet" href="/${asset.css}">`
    : "";
  return [
    css,
    `<div class="wordma-mdx" id="wordma-mdx-${key}" data-wordma-mdx="${key}"><p>MDX 内容需要 JavaScript</p></div>`,
    `<script type="module">const el=document.getElementById("wordma-mdx-${key}");import("/${asset.js}").then((mod)=>{if(el)mod.mount(el)}).catch(()=>{if(el)el.textContent="MDX 加载失败"});</script>`,
  ].join("");
}

const raw = await Bun.stdin.text();
if (!raw.trim()) {
  console.error("content-renderer: 标准输入为空");
  process.exit(1);
}

let request: RenderRequest;
try {
  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as RenderRequest).items)
  ) {
    throw new Error("请求必须是 { workspace, runtimePath, items }");
  }
  request = parsed as RenderRequest;
  if (typeof request.workspace !== "string" || !request.workspace) {
    throw new Error("缺少 workspace");
  }
} catch (error) {
  console.error(
    `content-renderer: 输入格式错误（${error instanceof Error ? error.message : String(error)}）`,
  );
  process.exit(1);
}

const parsedItems = request.items.map((item) => {
  try {
    const doc = JSON.parse(item.content) as JSONContent;
    return { item, doc, blocks: collectMdxBlocks(doc), error: null as string | null };
  } catch (error) {
    return {
      item,
      doc: null,
      blocks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

const compiledBySource = new Map<string, MdxCompileResult>();
const warnings: RenderWarning[] = [];
const assets = new Map<string, string>();

const hasBlocks = parsedItems.some((entry) => entry.blocks.length > 0);
if (hasBlocks) {
  for (const entry of parsedItems) {
    for (const block of entry.blocks) {
      if (compiledBySource.has(block.source)) continue;
      compiledBySource.set(
        block.source,
        await compileMdxBlock(block.source, {
          workspace: request.workspace,
          blockId: block.blockId,
          runtimeUrl: MDX_RUNTIME_URL,
        }),
      );
    }
  }

  let runtimeReady = false;
  if (request.runtimePath) {
    try {
      assets.set(
        "assets/mdx/react.js",
        await Bun.file(request.runtimePath).text(),
      );
      runtimeReady = true;
    } catch {
      runtimeReady = false;
    }
  }

  for (const entry of parsedItems) {
    if (entry.blocks.length === 0 || runtimeReady) continue;
    warnings.push({
      kind: entry.item.kind,
      id: entry.item.id,
      message: "缺少 MDX 运行时（assets/mdx/react.js），页面将无法挂载",
    });
  }

  for (const [source, compiled] of compiledBySource) {
    if (!compiled.ok) {
      for (const entry of parsedItems) {
        for (const block of entry.blocks) {
          if (block.source !== source) continue;
          warnings.push({
            kind: entry.item.kind,
            id: entry.item.id,
            blockId: block.blockId || undefined,
            message: compiled.error?.message ?? "MDX 编译失败",
          });
        }
      }
      continue;
    }
    if (!compiled.hash) continue;
    const asset = mdxAssetPaths(compiled.hash);
    assets.set(asset.js, compiled.code ?? "");
    if (compiled.css) assets.set(asset.css, compiled.css);
  }
}

const results: RenderItem[] = parsedItems.map(({ item, doc, blocks, error }) => {
  if (!doc || error) {
    return { kind: item.kind, id: item.id, ok: false, error: error ?? "正文不是合法 JSON" };
  }
  try {
    let index = 0;
    const html = renderToHTML(doc, {
      mdx: (node) => {
        const block = blocks[index];
        index += 1;
        if (!block) return errorBlock("MDX 块缺少数据");
        const source =
          typeof node.attrs.source === "string" ? node.attrs.source : "";
        return renderBlock(item, index - 1, compiledBySource.get(source));
      },
    });
    // feed 只保留占位，不写入脚本/样式
    const feedHtml = renderToHTML(doc);
    return { kind: item.kind, id: item.id, ok: true, html, feedHtml };
  } catch (error) {
    return {
      kind: item.kind,
      id: item.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

const response = {
  items: results,
  assets: [...assets].map(([path, contents]) => ({ path, contents })),
  warnings,
};
process.stdout.write(JSON.stringify(response));
