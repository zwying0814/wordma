import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

import { getDataDir } from './db';

/**
 * MDX 岛：站点目录下的 components/*.tsx 是组件源码，文章用 MDX 块引用它们。
 * 编译走 esbuild：react 家族保持 external（交给 importmap 指向共享运行时），
 * 相对导入与应用已装的 npm 包都打进同一个文件。
 */

export type ComponentMeta = {
  name: string;
  bytes: number;
  updatedAt: string;
};

export type CompileResult =
  | { ok: true; code: string; hash: string }
  | { ok: false; errors: string[] };

const NAME_MAX = 64;
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const SOURCE_MAX = 512 * 1024;

/** 交给宿主提供的模块（编辑器 importmap / 发布页面 importmap 都指向同一个运行时） */
const EXTERNAL_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
];

/**
 * 应用根目录（apps/desktop）：主进程被打包成 electron/main.mjs，
 * 所以以本文件的 import.meta.url 为准，而不是 process.cwd()（打包态 cwd 不可靠）。
 */
function appRoot(): string {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  } catch {
    return process.cwd();
  }
}

export function componentsDir(): string {
  return path.join(getDataDir(), 'components');
}

export function validateComponentName(name: string): void {
  if (!name) throw new Error('组件名不能为空');
  if (name.length > NAME_MAX) throw new Error(`组件名不能超过 ${NAME_MAX} 个字符`);
  if (!NAME_RE.test(name)) {
    throw new Error('组件名只能用小写字母、数字与连字符，且以字母或数字开头');
  }
}

function componentPath(name: string): string {
  validateComponentName(name);
  return path.join(componentsDir(), `${name}.tsx`);
}

export function listComponents(): ComponentMeta[] {
  const dir = componentsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => {
      const file = path.join(dir, entry.name);
      const stat = statSync(file);
      return {
        name: entry.name.replace(/\.tsx$/, ''),
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readComponent(name: string): string {
  const file = componentPath(name);
  if (!existsSync(file)) throw new Error(`组件「${name}」不存在`);
  return readFileSync(file, 'utf8');
}

export function componentExists(name: string): boolean {
  try {
    return existsSync(componentPath(name));
  } catch {
    return false;
  }
}

/** 保存组件源码；先编译，编译不过就不落库（避免把坏代码写进站点目录） */
export function writeComponent(name: string, code: string): ComponentMeta {
  const file = componentPath(name);
  if (typeof code !== 'string') throw new Error('组件内容必须是字符串');
  if (code.length > SOURCE_MAX) {
    throw new Error(`组件源码不能超过 ${Math.round(SOURCE_MAX / 1024)}KB`);
  }

  const compiled = compileSource(name, code);
  if (!compiled.ok) {
    throw new Error(`编译失败：\n${compiled.errors.join('\n')}`);
  }

  mkdirSync(componentsDir(), { recursive: true });
  writeFileSync(file, code);
  const stat = statSync(file);
  return { name, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
}

export function deleteComponent(name: string): void {
  const file = componentPath(name);
  if (!existsSync(file)) throw new Error(`组件「${name}」不存在`);
  rmSync(file);
}

/**
 * 编译结果缓存：源码哈希 → 产物（编辑器每次渲染都会问一次）。
 * 只缓存成功的结果 —— 失败往往是「包还没装」，缓存了会导致装完包仍报旧错。
 */
const cache = new Map<string, Extract<CompileResult, { ok: true }>>();

/** 编译单个组件的源码为 ESM 岛 */
export function compileSource(name: string, code: string): CompileResult {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const cached = cache.get(hash);
  if (cached) return cached;

  try {
    const built = esbuild.buildSync({
      bundle: true,
      define: { 'process.env.NODE_ENV': '"production"' },
      external: EXTERNAL_MODULES,
      format: 'esm',
      jsx: 'automatic',
      /**
       * npm 包解析顺序：
       * 1. 站点目录自己的 node_modules（resolveDir 在 {站点目录}/components，
       *    esbuild 会逐级向上找，所以用户在站点目录 npm install 的包天然可用）
       * 2. 应用自己的 node_modules（应用直接声明的依赖，如 react / lucide-react）
       */
      nodePaths: [path.join(appRoot(), 'node_modules')],
      platform: 'browser',
      target: 'es2022',
      write: false,
      stdin: {
        contents: code,
        loader: 'tsx',
        resolveDir: componentsDir(),
        sourcefile: `${name}.tsx`,
      },
    });
    const success: Extract<CompileResult, { ok: true }> = {
      ok: true,
      code: built.outputFiles[0].text,
      hash,
    };
    cache.set(hash, success);
    return success;
  } catch (err) {
    return { ok: false, errors: formatEsbuildErrors(err) };
  }
}

/** 编译站点目录里的组件（读盘） */
export function compileComponent(name: string): CompileResult {
  if (!componentExists(name)) {
    return { ok: false, errors: [`组件「${name}」不存在`] };
  }
  return compileSource(name, readComponent(name));
}

/** 岛在编辑器里的取用地址（hash 变化即重新编译，天然做缓存失效） */
export function islandUrl(name: string, hash: string): string {
  return `wordma-island://site/${name}.js?v=${hash}`;
}

/** 宿主提供的 React 运行时（构建期脚本产出；缺失时给可读提示） */
export function islandRuntimeCode(): string {
  const file = path.join(appRoot(), 'electron/assets/react-island.js');
  if (!existsSync(file)) {
    throw new Error(
      '缺少 React 运行时产物 electron/assets/react-island.js，请先运行 pnpm build:islands'
    );
  }
  return readFileSync(file, 'utf8');
}

/** esbuild 的报错信息（含文件与行列）整理成可读文本 */
function formatEsbuildErrors(err: unknown): string[] {
  const errors = (err as { errors?: { text: string; location?: { file?: string; line?: number; column?: number } }[] })
    .errors;
  if (!errors?.length) {
    return [err instanceof Error ? err.message : String(err)];
  }
  return errors.map((error) => {
    const loc = error.location;
    const message = error.text;
    // 未安装的包最容易卡住用户，直接把两种安装方式写进报错里
    const missing = /Could not resolve "([^"./][^"]*)"/.exec(message);
    const hint = missing
      ? `\n  如果是第三方包：在站点目录执行 npm install ${missing[1]}（只给这个站点用），或在应用里执行 pnpm --filter desktop add ${missing[1]}（所有站点可用）`
      : '';
    if (!loc) return message + hint;
    const file = loc.file ? path.basename(loc.file) : 'component.tsx';
    return `${file}:${loc.line ?? 0}:${loc.column ?? 0} ${message}${hint}`;
  });
}
