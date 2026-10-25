#!/usr/bin/env node
/**
 * 用内置 Bun sidecar 运行仓库里的 TypeScript/CLI。
 *
 * 用法：
 *   node scripts/run-bun.mjs packages/engine/src/cli.ts --help
 *   pnpm engine --help
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const triples = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

const triple = triples[`${process.platform}-${process.arch}`];

if (!triple) {
  console.error(`不支持的平台：${process.platform}-${process.arch}`);
  process.exit(1);
}

const ext = process.platform === 'win32' ? '.exe' : '';
const bun = path.join(
  root,
  'apps/desktop/src-tauri/binaries',
  `bun-${triple}${ext}`,
);

if (!existsSync(bun)) {
  console.error(`未找到 Bun sidecar：${path.relative(root, bun)}`);
  console.error('请先运行：pnpm fetch:bun');
  process.exit(1);
}

const result = spawnSync(bun, process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
