/**
 * 生成岛（island）用的 React 运行时 ESM 包。
 *
 * 为什么需要这个脚本：`export * from 'react'` 对 CJS 模块**不生成命名导出**
 * （实测 esbuild 只会漏出 createRoot），所以这里用 Object.keys 把四个模块的
 * 导出面展开成显式的 `export const x = NS.x`（去重后 60+ 个），再打成单个 ESM。
 *
 * 产物 electron/assets/react-island.js 被两处使用：
 * - 编辑器：wordma-island://runtime/react.js（配 index.html 的 importmap）
 * - 发布产物：assets/mdx/react.js（配页面里的 importmap）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const outFile = path.join(appRoot, 'electron/assets/react-island.js');

/** 岛可能用到的模块：react 本体 + 自动 JSX 运行时 + react-dom（含 client） */
const MODULES = [
  ['React', 'react'],
  ['JsxRuntime', 'react/jsx-runtime'],
  ['DomClient', 'react-dom/client'],
  ['Dom', 'react-dom'],
];

const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const lines = MODULES.map(
  ([alias, spec]) => `import * as ${alias} from ${JSON.stringify(spec)};`
);
lines.push('export default React;');

const seen = new Set();
for (const [alias, spec] of MODULES) {
  for (const name of Object.keys(require(spec))) {
    // 跳过 default 与非法标识符；同名（Fragment/version 等）只取第一个来源
    if (name === 'default' || !identifier.test(name) || seen.has(name)) continue;
    seen.add(name);
    lines.push(`export const ${name} = ${alias}.${name};`);
  }
}

const result = esbuild.buildSync({
  stdin: {
    contents: lines.join('\n'),
    loader: 'js',
    resolveDir: appRoot,
    sourcefile: 'react-island-runtime.js',
  },
  bundle: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  format: 'esm',
  logLevel: 'warning',
  minify: true,
  platform: 'browser',
  target: 'es2022',
  write: false,
});

const code = result.outputFiles[0].text;
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, code);

console.log(
  `react-island.js 已生成：${seen.size} 个导出，${Math.round(code.length / 1024)}KB`
);
