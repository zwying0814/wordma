import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import type {
  AssetRef,
  ContentDiagnostic,
  ContentEntry,
} from '@wordma/content';

import { assetUrl } from '../assets';

export type CopyContentAssetsOptions = {
  workspaceRoot: string;
  outDir: string;
  basePath?: string;
  entries: ContentEntry[];
};

export type ContentAssetsResult = {
  assets: AssetRef[];
  bySource: Map<string, AssetRef>;
  byRealPath: Map<string, AssetRef>;
  diagnostics: ContentDiagnostic[];
};

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function safeFileName(name: string): string {
  const value = name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/^-+|-+$/g, '');

  return value || 'asset';
}

function splitSuffix(
  value: string,
): { pathname: string; suffix: string } {
  const index = value.search(/[?#]/);

  return index === -1
    ? { pathname: value, suffix: '' }
    : {
        pathname: value.slice(0, index),
        suffix: value.slice(index),
      };
}

function isExternal(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

export function resolveContentAssetPath(
  rawPath: string,
  entryFilePath: string,
  workspaceRoot: string,
): string | undefined {
  const trimmed = rawPath.trim();
  if (!trimmed || isExternal(trimmed)) return undefined;

  const { pathname } = splitSuffix(trimmed);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }

  let baseDirectory: string;
  try {
    baseDirectory = realpathSync(
      path.dirname(entryFilePath),
    );
  } catch {
    baseDirectory = path.resolve(
      path.dirname(entryFilePath),
    );
  }

  const candidate = path.resolve(baseDirectory, decoded);
  const workspaceReal = realpathSync(workspaceRoot);

  if (!isInside(workspaceReal, candidate)) {
    return undefined;
  }

  try {
    const realPath = realpathSync(candidate);
    return isInside(workspaceReal, realPath)
      ? realPath
      : undefined;
  } catch {
    return undefined;
  }
}

export type ContentAssetResolverOptions = {
  entryFilePath: string;
  workspaceRoot: string;
  byRealPath: Map<string, AssetRef>;
};

export function createContentAssetResolver(
  options: ContentAssetResolverOptions,
): (rawPath: string) => string | undefined {
  return (rawPath: string) => {
    const trimmed = rawPath.trim();
    if (!trimmed || isExternal(trimmed)) return undefined;

    const realPath = resolveContentAssetPath(
      trimmed,
      options.entryFilePath,
      options.workspaceRoot,
    );
    if (!realPath) return undefined;

    const asset = options.byRealPath.get(realPath);
    if (!asset) return undefined;

    const { suffix } = splitSuffix(trimmed);
    return `${asset.url}${suffix}`;
  };
}

/**
 * 把内容资源复制到 assets/content，并生成内容 hash URL。
 */
export function copyContentAssets(
  options: CopyContentAssetsOptions,
): ContentAssetsResult {
  const workspaceRoot = realpathSync(options.workspaceRoot);
  const bySource = new Map<string, AssetRef>();
  const byRealPath = new Map<string, AssetRef>();
  const diagnostics: ContentDiagnostic[] = [];
  const seen = new Set<string>();
  const copied = new Set<string>();

  for (const entry of options.entries) {
    for (const asset of entry.assets) {
      if (seen.has(asset.source)) continue;
      seen.add(asset.source);

      const absolute = path.resolve(
        workspaceRoot,
        asset.source,
      );

      let realPath: string;
      let stat;
      try {
        realPath = realpathSync(absolute);
        stat = statSync(realPath);
      } catch {
        diagnostics.push({
          code: 'MISSING_ASSET',
          severity: 'warning',
          file: entry.filePath,
          path: asset.source,
          message: `资源不存在：${asset.source}`,
        });
        continue;
      }

      if (
        !isInside(workspaceRoot, realPath) ||
        !stat.isFile()
      ) {
        diagnostics.push({
          code: 'UNSAFE_ASSET',
          severity: 'warning',
          file: entry.filePath,
          path: asset.source,
          message: `资源路径无效：${asset.source}`,
        });
        continue;
      }

      const bytes = readFileSync(realPath);
      const hash = createHash('sha256')
        .update(bytes)
        .digest('hex')
        .slice(0, 8);
      const name = safeFileName(
        path.basename(asset.source),
      );
      const relativePath = `assets/content/${hash}-${name}`;
      const target = path.join(
        options.outDir,
        relativePath,
      );

      if (!copied.has(relativePath)) {
        copied.add(relativePath);
        mkdirSync(path.dirname(target), {
          recursive: true,
        });
        copyFileSync(realPath, target);
      }

      const resolved: AssetRef = {
        source: asset.source,
        url: assetUrl(options.basePath, relativePath),
        hash,
        bytes: stat.size,
      };

      bySource.set(asset.source, resolved);
      byRealPath.set(realPath, resolved);
    }
  }

  return {
    assets: [...bySource.values()].sort((a, b) =>
      a.source.localeCompare(b.source),
    ),
    bySource,
    byRealPath,
    diagnostics,
  };
}
