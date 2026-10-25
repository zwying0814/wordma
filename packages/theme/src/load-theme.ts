import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';
import type { ThemeManifest } from '@wordma/content';

export type ThemePackageJson = {
  name: string;
  version?: string;
  exports?: unknown;
};

export type LoadedThemePackage = {
  directory: string;
  manifest: ThemeManifest;
  packageJson: ThemePackageJson;
  entry: string;
  entryPath: string;
};

function resolveExport(exportsField: unknown): string | undefined {
  if (typeof exportsField === 'string') return exportsField;
  if (!exportsField || typeof exportsField !== 'object') return undefined;

  const rootExport = (exportsField as Record<string, unknown>)['.'];
  if (typeof rootExport === 'string') return rootExport;
  if (!rootExport || typeof rootExport !== 'object') return undefined;

  const conditions = rootExport as Record<string, unknown>;
  for (const key of ['import', 'default', 'require']) {
    if (typeof conditions[key] === 'string') {
      return conditions[key];
    }
  }

  return undefined;
}

/**
 * 读取并校验一个本地主题包目录。
 *
 * M0.6 只做本地目录解析；M6 会在此基础上接 workspace node_modules 解析。
 */
export function loadThemePackage(directory: string): LoadedThemePackage {
  const root = path.resolve(directory);
  const manifest = parseThemeManifest(
    parseYamlFile(path.join(root, 'theme.yaml')),
  );

  let packageJson: ThemePackageJson;
  try {
    packageJson = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as ThemePackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取主题 package.json 失败：${message}`);
  }

  if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
    throw new Error('主题 package.json 缺少 name');
  }

  if (packageJson.name !== manifest.id) {
    throw new Error(
      `主题包名与 manifest.id 不一致：${packageJson.name} !== ${manifest.id}`,
    );
  }

  const entry = resolveExport(packageJson.exports);
  if (!entry) {
    throw new Error('主题 package.json 缺少 exports["."]');
  }

  const entryPath = path.resolve(root, entry);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!entryPath.startsWith(rootPrefix)) {
    throw new Error(`主题入口必须位于主题目录内：${entry}`);
  }

  if (!existsSync(entryPath)) {
    throw new Error(`主题入口不存在：${entry}`);
  }

  return {
    directory: root,
    manifest,
    packageJson,
    entry,
    entryPath,
  };
}
