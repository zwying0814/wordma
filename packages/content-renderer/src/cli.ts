import { renderToHTML, type JSONContent } from "@wordma/editor-schema";

interface RenderInput {
  kind: "article" | "page";
  id: number;
  content: string;
}

interface RenderOutput {
  kind: "article" | "page";
  id: number;
  ok: boolean;
  html?: string;
  error?: string;
}

function renderOne(item: RenderInput): RenderOutput {
  try {
    const doc = JSON.parse(item.content) as JSONContent;
    return { kind: item.kind, id: item.id, ok: true, html: renderToHTML(doc) };
  } catch (error) {
    return {
      kind: item.kind,
      id: item.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const raw = await Bun.stdin.text();
if (!raw.trim()) {
  console.error("content-renderer: 标准输入为空");
  process.exit(1);
}

let input: RenderInput[];
try {
  input = JSON.parse(raw) as RenderInput[];
} catch (error) {
  console.error(
    `content-renderer: 输入不是合法 JSON（${error instanceof Error ? error.message : String(error)}）`,
  );
  process.exit(1);
}

process.stdout.write(JSON.stringify(input.map(renderOne)));
