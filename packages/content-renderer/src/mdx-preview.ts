import { compileMdxBlock } from "./mdx";

interface PreviewRequest {
  workspace: string;
  blockId?: string;
  source: string;
}

const raw = await Bun.stdin.text();
if (!raw.trim()) {
  console.error("mdx-preview: 标准输入为空");
  process.exit(1);
}

let request: PreviewRequest;
try {
  request = JSON.parse(raw) as PreviewRequest;
} catch (error) {
  console.error(
    `mdx-preview: 输入不是合法 JSON（${error instanceof Error ? error.message : String(error)}）`,
  );
  process.exit(1);
}

if (typeof request.workspace !== "string" || typeof request.source !== "string") {
  console.error("mdx-preview: 缺少 workspace 或 source");
  process.exit(1);
}

const result = await compileMdxBlock(request.source, {
  workspace: request.workspace,
  blockId: request.blockId,
});
process.stdout.write(JSON.stringify(result));
