#!/usr/bin/env node
/**
 * 用仓库内或系统 Bun 把 packages/content-renderer 打成单文件 CLI，
 * 供 Tauri resources 随应用分发。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(appRoot, "../..");
const entry = path.join(
  repoRoot,
  "packages",
  "content-renderer",
  "src",
  "cli.ts",
);
const outDir = path.join(
  appRoot,
  "src-tauri",
  "resources",
  "content-renderer",
);
const outFile = path.join(outDir, "cli.js");

const HOST_TRIPLES = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

function resolveBun() {
  if (process.env.WORDMA_BUN) return process.env.WORDMA_BUN;

  const triple = HOST_TRIPLES[`${process.platform}-${process.arch}`];
  if (triple) {
    const candidate = path.join(
      appRoot,
      "src-tauri",
      "binaries",
      `bun-${triple}${process.platform === "win32" ? ".exe" : ""}`,
    );
    if (existsSync(candidate)) return candidate;
  }

  return "bun";
}

mkdirSync(outDir, { recursive: true });
execFileSync(
  resolveBun(),
  ["build", entry, "--target=bun", "--format=esm", "--outfile", outFile],
  { stdio: "inherit" },
);
console.log(`内容渲染器已生成：${path.relative(process.cwd(), outFile)}`);
