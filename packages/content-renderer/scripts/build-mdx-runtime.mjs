/**
 * 生成发布/预览共用的 React 运行时（ESM）。
 * 用 Bun 运行：bun build-mdx-runtime.mjs <outfile>
 *
 * `export * from "react"` 对 CJS 包不可靠（会缺 Fragment/version），
 * 所以这里展开命名导出后交给 Bun.build 打成一个浏览器 ESM。
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import * as Jsx from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";

const outfile = process.argv[2];
if (!outfile) {
  console.error("用法: bun build-mdx-runtime.mjs <outfile>");
  process.exit(1);
}

const RESERVED = new Set([
  "default",
  "delete",
  "new",
  "class",
  "function",
  "var",
  "let",
  "const",
  "return",
  "import",
  "export",
  "super",
  "this",
  "null",
  "true",
  "false",
  "in",
  "instanceof",
  "typeof",
  "void",
  "yield",
  "await",
]);

const seen = new Set();
function exportBlock(namespace, source) {
  const names = Object.keys(namespace).filter(
    (name) =>
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) &&
      !RESERVED.has(name) &&
      !seen.has(name),
  );
  for (const name of names) seen.add(name);
  return names.length ? `export const { ${names.join(", ")} } = ${source};` : "";
}

const source = [
  'import * as React from "react";',
  'import * as Jsx from "react/jsx-runtime";',
  'import * as ReactDOM from "react-dom";',
  'import * as ReactDOMClient from "react-dom/client";',
  exportBlock(React, "React"),
  exportBlock(Jsx, "Jsx"),
  exportBlock(ReactDOM, "ReactDOM"),
  exportBlock(ReactDOMClient, "ReactDOMClient"),
]
  .filter(Boolean)
  .join("\n");

const work = mkdtempSync(
  join(dirname(fileURLToPath(import.meta.url)), ".tmp-runtime-"),
);
try {
  const entry = join(work, "runtime-entry.js");
  writeFileSync(entry, source, "utf8");
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: work,
    target: "browser",
    format: "esm",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    naming: "runtime.[ext]",
    throw: false,
  });
  if (!result.success) {
    console.error(result.logs.map(String).join("\n"));
    process.exit(1);
  }
  const code = readFileSync(join(work, "runtime.js"));
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, code);
  console.log(
    `MDX 运行时已生成：${outfile}（${(code.length / 1024).toFixed(0)} KB，${seen.size} 个导出）`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
