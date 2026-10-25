import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import type { ContentDiagnostic } from '@wordma/content';

import { assetUrl } from '../assets';

export type StaticFile = {
  source: string;
  /** dist 内相对路径（POSIX） */
  path: string;
  url: string;
};

export type CopyStaticOptions = {
  root: string;
  themeDirectory: string;
  outDir: string;
  basePath?: string;
};

export type StaticCopyResult = {
  files: StaticFile[];
  diagnostics: ContentDiagnostic[];
};

type CopyTreeResult = {
  files: StaticFile[];
  paths: Set<string>;
  diagnostics: ContentDiagnostic[];
};

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function copyTree(
  sourceDir: string,
  outDir: string,
  basePath: string | undefined,
  publicPaths: Set<string> | undefined,
): CopyTreeResult {
  const files: StaticFile[] = [];
  const paths = new Set<string>();
  const diagnostics: ContentDiagnostic[] = [];

  if (!existsSync(sourceDir)) {
    return { files, paths, diagnostics };
  }

  let sourceRoot: string;
  try {
    sourceRoot = realpathSync(sourceDir);
  } catch {
    return { files, paths, diagnostics };
  }

  const visited = new Set<string>();

  const walk = (directory: string): void => {
    let realDirectory: string;
    try {
      realDirectory = realpathSync(directory);
    } catch {
      return;
    }
    if (visited.has(realDirectory)) return;
    visited.add(realDirectory);

    const entries = readdirSync(directory, {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      let realPath: string;
      try {
        realPath = realpathSync(fullPath);
      } catch {
        continue;
      }

      if (!isInside(sourceRoot, realPath)) {
        diagnostics.push({
          code: 'UNSAFE_STATIC',
          severity: 'warning',
          file: fullPath,
          message: `静态资源指向目录外：${fullPath}`,
        });
        continue;
      }

      let stat;
      try {
        stat = statSync(realPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!stat.isFile()) continue;

      const relativePath = toPosix(
        path.relative(sourceDir, fullPath),
      );

      if (publicPaths?.has(relativePath)) {
        diagnostics.push({
          code: 'STATIC_CONFLICT',
          severity: 'warning',
          file: fullPath,
          path: relativePath,
          message: `主题静态资源与 public 冲突，已保留 public：${relativePath}`,
        });
        continue;
      }

      const target = path.join(outDir, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(realPath, target);

      paths.add(relativePath);
      files.push({
        source: fullPath,
        path: relativePath,
        url: assetUrl(basePath, relativePath),
      });
    }
  };

  walk(sourceDir);

  return { files, paths, diagnostics };
}

/**
 * 复制工作区 public 与主题 static，public 优先。
 */
export function copyStaticAssets(
  options: CopyStaticOptions,
): StaticCopyResult {
  const publicDir = path.join(options.root, 'public');
  const themeStatic = path.join(
    options.themeDirectory,
    'static',
  );

  const publicResult = copyTree(
    publicDir,
    options.outDir,
    options.basePath,
    undefined,
  );
  const themeResult = copyTree(
    themeStatic,
    options.outDir,
    options.basePath,
    publicResult.paths,
  );

  return {
    files: [...publicResult.files, ...themeResult.files],
    diagnostics: [
      ...publicResult.diagnostics,
      ...themeResult.diagnostics,
    ],
  };
}
