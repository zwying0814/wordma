import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ContentDiagnostic } from '@wordma/content';

import { BuildError } from '../errors';
import type { Route } from '../routing/manifest';

export type BuildManifest = {
  version: 1;
  site: {
    title: string;
    basePath: string;
  };
  theme: {
    id: string;
    version: string;
  };
  routes: Route[];
  diagnostics: ContentDiagnostic[];
};

export const BUILD_MANIFEST_FILE = '.wordma-manifest.json';

export function resolveOutDir(
  rootInput: string,
  outInput?: string,
): string {
  const root = path.resolve(rootInput);
  // 显式 --out 相对当前工作目录；缺省输出放到 workspace 的 .wordma/dist。
  const outDir = outInput
    ? path.resolve(outInput)
    : path.join(root, '.wordma/dist');
  const relativeFromOut = path.relative(outDir, root);

  if (
    outDir === root ||
    relativeFromOut === '' ||
    (!relativeFromOut.startsWith('..') &&
      !path.isAbsolute(relativeFromOut))
  ) {
    throw new BuildError(
      'UNSAFE_OUT_DIR',
      `输出目录不能是工作区或其父目录：${outDir}`,
      { path: outDir },
    );
  }

  return outDir;
}

export function prepareOutDir(outDir: string): void {
  try {
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
    mkdirSync(outDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BuildError(
      'WRITE_FAILED',
      `准备输出目录失败：${message}`,
      { path: outDir },
    );
  }
}

export function writeHtmlFile(
  outDir: string,
  route: Route,
  html: string,
): void {
  const target = path.resolve(outDir, route.output);
  const relative = path.relative(outDir, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new BuildError(
      'UNSAFE_OUTPUT_PATH',
      `输出路径超出 dist：${route.output}`,
      { path: target },
    );
  }

  try {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BuildError(
      'WRITE_FAILED',
      `写入页面失败：${message}`,
      { path: target },
    );
  }
}

export function writeBuildManifest(
  outDir: string,
  manifest: BuildManifest,
): void {
  const target = path.join(outDir, BUILD_MANIFEST_FILE);

  try {
    writeFileSync(
      target,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BuildError(
      'WRITE_FAILED',
      `写入构建 manifest 失败：${message}`,
      { path: target },
    );
  }
}
