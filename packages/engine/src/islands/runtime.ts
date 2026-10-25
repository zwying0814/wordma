import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { assetUrl } from '../assets';
import { IslandError } from '../errors';

export type IslandRuntimeAsset = {
  /** HTML 中的 URL（已含 basePath） */
  url: string;
  /** 缓存中的文件路径 */
  filePath: string;
  bytes: number;
};

export type IslandRuntime = {
  react: IslandRuntimeAsset;
  mount: IslandRuntimeAsset;
  importMap: Record<string, string>;
};

export type BuildIslandRuntimeOptions = {
  cacheDir: string;
  basePath?: string;
};

const MOUNT_SCRIPT = `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

async function mount(host) {
  const src = host.getAttribute('data-wordma-src');
  if (!src) return;
  const exportName =
    host.getAttribute('data-wordma-export') || 'default';
  const propsText =
    host.getAttribute('data-wordma-props') || '{}';
  const props = propsText ? JSON.parse(propsText) : {};
  const slot = host.querySelector('[data-wordma-slot]');
  const slotHtml = slot ? slot.innerHTML : '';
  const island = await import(src);
  const Component =
    island.default ??
    island[exportName] ??
    island[exportName.split('.')[0]];
  if (!Component) {
    throw new Error(
      'Wordma island not found: ' + exportName + ' (' + src + ')',
    );
  }
  const children = slot
    ? createElement('div', {
        className: 'wordma-island-slot',
        style: { display: 'contents' },
        dangerouslySetInnerHTML: { __html: slotHtml },
      })
    : undefined;
  createRoot(host).render(
    createElement(
      Component,
      children === undefined ? props : { ...props, children },
    ),
  );
}

for (const host of document.querySelectorAll(
  '[data-wordma-island]',
)) {
  mount(host).catch((error) => {
    host.setAttribute('data-wordma-island-error', 'true');
    console.error(
      '[wordma] island failed to mount',
      host,
      error,
    );
  });
}
`;

function moveFile(from: string, to: string): void {
  if (from === to) return;

  rmSync(to, { force: true });
  renameSync(from, to);
}

function contentHash(source: string): string {
  return createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, 10);
}

function runtimeError(message: string): IslandError {
  return new IslandError('ISLAND_BUILD_FAILED', message);
}

async function buildReactRuntime(
  cacheDir: string,
  basePath: string | undefined,
): Promise<IslandRuntimeAsset> {
  const entry = path.join(
    import.meta.dirname,
    'runtime-entry.ts',
  );

  let output: Awaited<ReturnType<typeof Bun.build>>;

  try {
    output = await Bun.build({
      entrypoints: [entry],
      outdir: cacheDir,
      target: 'browser',
      format: 'esm',
      minify: true,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      naming: '[name].[ext]',
    });
  } catch (error) {
    throw runtimeError(
      `React 运行时打包失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!output.success) {
    throw runtimeError(
      `React 运行时打包失败：${output.logs
        .map((log) => log.message)
        .join('\n')}`,
    );
  }

  const jsOutput = output.outputs.find(
    (item) =>
      item.kind === 'entry-point' &&
      item.path.endsWith('.js'),
  );
  if (!jsOutput) {
    throw runtimeError('React 运行时未产出 JS');
  }

  const text = await jsOutput.text();
  const file = `react-${contentHash(text)}.js`;
  const filePath = path.join(cacheDir, file);

  if (jsOutput.path !== filePath) {
    moveFile(jsOutput.path, filePath);
  }

  return {
    url: assetUrl(
      basePath,
      `assets/islands/${file}`,
    ),
    filePath,
    bytes: new TextEncoder().encode(text).length,
  };
}

function writeMountScript(
  cacheDir: string,
  basePath: string | undefined,
): IslandRuntimeAsset {
  const file = `mount-${contentHash(MOUNT_SCRIPT)}.js`;
  const filePath = path.join(cacheDir, file);

  writeFileSync(filePath, MOUNT_SCRIPT);

  return {
    url: assetUrl(
      basePath,
      `assets/islands/${file}`,
    ),
    filePath,
    bytes: new TextEncoder().encode(MOUNT_SCRIPT).length,
  };
}

/**
 * 生成自托管 React 运行时与岛屿挂载脚本。
 *
 * 运行时按内容 hash 命名；importmap 供浏览器解析裸模块。
 */
export async function buildIslandRuntime(
  options: BuildIslandRuntimeOptions,
): Promise<IslandRuntime> {
  const cacheDir = path.resolve(options.cacheDir);
  mkdirSync(cacheDir, { recursive: true });

  const react = await buildReactRuntime(
    cacheDir,
    options.basePath,
  );
  const mount = writeMountScript(
    cacheDir,
    options.basePath,
  );

  return {
    react,
    mount,
    importMap: {
      react: react.url,
      'react/jsx-runtime': react.url,
      'react/jsx-dev-runtime': react.url,
      'react-dom': react.url,
      'react-dom/client': react.url,
    },
  };
}

export function copyIslandRuntime(
  outDir: string,
  runtime: IslandRuntime,
): void {
  const targetDir = path.join(
    outDir,
    'assets',
    'islands',
  );
  mkdirSync(targetDir, { recursive: true });

  for (const asset of [runtime.react, runtime.mount]) {
    copyFileSync(
      asset.filePath,
      path.join(targetDir, path.basename(asset.filePath)),
    );
  }
}
