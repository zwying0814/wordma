#!/usr/bin/env node
/**
 * 下载与当前平台匹配的 Bun，并按 Tauri sidecar 约定命名：
 *
 *   src-tauri/binaries/bun-<target-triple>[.exe]
 *
 * 走 npmmirror 上的 Bun 官方平台包（@oven/bun-*），避免 GitHub 下载超时。
 * 已存在时直接跳过；`--force` 强制重新下载。
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUN_VERSION = process.env.BUN_VERSION ?? '1.4.4';
const REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmmirror.com';
const force = process.argv.includes('--force');

/** Tauri target triple -> Bun npm 平台包 */
const byTriple = {
  'aarch64-apple-darwin': 'bun-darwin-aarch64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-unknown-linux-gnu': 'bun-linux-x64',
  'aarch64-unknown-linux-gnu': 'bun-linux-aarch64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
};

/** 当前主机对应的 Tauri target triple */
const hostTriple = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
}[`${process.platform}-${process.arch}`];

function readTargetArg() {
  const index = process.argv.indexOf('--target');
  if (index !== -1) return process.argv[index + 1];

  const inline = process.argv.find((arg) => arg.startsWith('--target='));
  return inline?.slice('--target='.length);
}

/** 优先级：--target > BUN_TARGET > 当前主机 */
const triple = readTargetArg() ?? process.env.BUN_TARGET ?? hostTriple;
const pkg = triple ? byTriple[triple] : undefined;

if (!triple || !pkg) {
  console.error(`不支持的目标：${triple ?? `${process.platform}-${process.arch}`}`);
  process.exit(1);
}

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.join(appRoot, 'src-tauri', 'binaries');
const ext = triple.includes('windows') ? '.exe' : '';
const dest = path.join(binDir, `bun-${triple}${ext}`);

if (existsSync(dest) && !force) {
  console.log(`Bun sidecar 已存在：${path.relative(process.cwd(), dest)}`);
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });
const workDir = mkdtempSync(path.join(tmpdir(), 'wordma-bun-'));

try {
  const tarball = `${REGISTRY}/@oven/${pkg}/-/${pkg}-${BUN_VERSION}.tgz`;
  console.log(`下载 Bun ${BUN_VERSION}（${pkg}）…`);

  const res = await fetch(tarball);
  if (!res.ok) {
    throw new Error(`下载失败：${res.status} ${res.statusText}\n${tarball}`);
  }

  const archive = path.join(workDir, 'bun.tgz');
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  // macOS / Linux 自带 tar；Windows 10+ 自带 bsdtar。
  execFileSync('tar', ['-xzf', archive, '-C', workDir], { stdio: 'inherit' });

  const source = path.join(workDir, 'package', 'bin', `bun${ext}`);
  copyFileSync(source, dest);
  if (!ext) chmodSync(dest, 0o755);

  console.log(`已写入：${path.relative(process.cwd(), dest)}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
