import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { ContentDiagnostic } from './diagnostics';
import type { AssetRef } from './types/common';

export type CollectAssetsOptions = {
  entryFilePath: string;
  isFolderEntry: boolean;
  cover?: string;
  body: string;
  workspaceRoot: string;
};

export type CollectAssetsResult = {
  assets: AssetRef[];
  diagnostics: ContentDiagnostic[];
};

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function isExternalAsset(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function stripQueryAndHash(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? '';
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeRawPath(value: string): string {
  return stripQueryAndHash(value.trim().replace(/^<|>$/g, ''));
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(
    path.resolve(root),
    path.resolve(target),
  );
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

function listFolderFiles(
  directory: string,
  entryFilePath: string,
): string[] {
  const files: string[] = [];
  const entry = path.resolve(entryFilePath);

  const walk = (current: string): void => {
    const dirents = readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    );

    for (const dirent of dirents) {
      if (
        dirent.name.startsWith('_') ||
        dirent.name.startsWith('.')
      ) {
        continue;
      }

      const fullPath = path.join(current, dirent.name);

      if (dirent.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!dirent.isFile()) continue;
      if (path.resolve(fullPath) === entry) continue;

      files.push(path.relative(directory, fullPath));
    }
  };

  walk(directory);
  return files;
}

function extractBodyAssetPaths(body: string): string[] {
  const paths: string[] = [];

  // Markdown 图片：![alt](path "title")
  const markdownImage =
    /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of body.matchAll(markdownImage)) {
    if (match[1]) paths.push(match[1]);
  }

  // HTML 图片：<img src="path">
  const htmlImage =
    /<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of body.matchAll(htmlImage)) {
    if (match[1]) paths.push(match[1]);
  }

  return paths;
}

export function collectAssets(
  options: CollectAssetsOptions,
): CollectAssetsResult {
  const {
    entryFilePath,
    isFolderEntry,
    cover,
    body,
    workspaceRoot,
  } = options;

  const entryDir = path.dirname(entryFilePath);
  const assets = new Map<string, AssetRef>();
  const diagnostics: ContentDiagnostic[] = [];

  const addAsset = (rawPath: string): void => {
    const cleaned = normalizeRawPath(rawPath);
    if (!cleaned || isExternalAsset(cleaned)) return;

    const resolved = path.resolve(entryDir, decodePath(cleaned));

    if (!isInside(workspaceRoot, resolved)) {
      diagnostics.push({
        code: 'UNSAFE_ASSET',
        severity: 'warning',
        file: entryFilePath,
        path: rawPath,
        message: `资源路径超出工作区：${rawPath}`,
      });
      return;
    }

    let stat;
    try {
      stat = statSync(resolved);
    } catch {
      diagnostics.push({
        code: 'MISSING_ASSET',
        severity: 'warning',
        file: entryFilePath,
        path: rawPath,
        message: `资源不存在：${rawPath}`,
      });
      return;
    }

    if (!stat.isFile()) return;

    const source = toPosix(path.relative(workspaceRoot, resolved));
    if (assets.has(source)) return;

    assets.set(source, {
      source,
      // M1 只占位；M4 负责复制、hash 和 URL 改写。
      url: source,
      bytes: stat.size,
    });
  };

  if (isFolderEntry) {
    for (const file of listFolderFiles(entryDir, entryFilePath)) {
      addAsset(file);
    }
  }

  if (cover) {
    addAsset(cover);
  }

  for (const rawPath of extractBodyAssetPaths(body)) {
    addAsset(rawPath);
  }

  return {
    assets: [...assets.values()].sort((a, b) =>
      a.source.localeCompare(b.source),
    ),
    diagnostics,
  };
}
