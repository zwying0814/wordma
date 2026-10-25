import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ContentDiagnostic, ThemeManifest } from '@wordma/content';
import { loadThemePackage } from '@wordma/theme';
import type { ThemeDefinition } from '@wordma/theme';

import { ThemeError } from '../errors';
import { resolveThemeDirectory } from './resolve';

export type ThemeRuntime = {
  directory: string;
  manifest: ThemeManifest;
  definition: ThemeDefinition;
  entryPath: string;
  diagnostics: ContentDiagnostic[];
};

const REQUIRED_LAYOUTS = [
  'root',
  'index',
  'post',
  'page',
  'notFound',
] as const;

const OPTIONAL_LAYOUTS = ['archive', 'taxonomy'] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isThemeDefinition(value: unknown): value is ThemeDefinition {
  if (typeof value !== 'object' || value === null) return false;
  if (!('layouts' in value)) return false;

  const layouts = (value as { layouts?: unknown }).layouts;
  return typeof layouts === 'object' && layouts !== null;
}

export async function loadThemeRuntime(
  rootInput: string,
  themeId: string,
): Promise<ThemeRuntime> {
  const root = path.resolve(rootInput);
  const directory = resolveThemeDirectory(root, themeId);

  if (!directory) {
    throw new ThemeError(
      'THEME_NOT_FOUND',
      `主题未找到：${themeId}`,
      { themeId },
    );
  }

  let loaded;

  try {
    loaded = loadThemePackage(directory);
  } catch (error) {
    throw new ThemeError(
      'INVALID_THEME_ENTRY',
      `主题包无效：${errorMessage(error)}`,
      { themeId, path: directory },
    );
  }

  let module: { default?: unknown };

  try {
    module = (await import(
      pathToFileURL(loaded.entryPath).href
    )) as { default?: unknown };
  } catch (error) {
    throw new ThemeError(
      'INVALID_THEME_ENTRY',
      `主题入口加载失败：${errorMessage(error)}`,
      { themeId, path: loaded.entryPath },
    );
  }

  if (!isThemeDefinition(module.default)) {
    throw new ThemeError(
      'INVALID_THEME_ENTRY',
      '主题入口必须默认导出 defineTheme(...) 的结果',
      { themeId, path: loaded.entryPath },
    );
  }

  const original = module.default;
  const layouts = { ...original.layouts };
  const diagnostics: ContentDiagnostic[] = [];

  for (const key of REQUIRED_LAYOUTS) {
    if (typeof layouts[key] !== 'function') {
      throw new ThemeError(
        'MISSING_LAYOUT',
        `主题缺少必需布局：${key}`,
        { themeId, path: directory },
      );
    }
  }

  const indexLayout = layouts.index;
  if (typeof indexLayout !== 'function') {
    throw new ThemeError(
      'MISSING_LAYOUT',
      '主题缺少必需布局：index',
      { themeId, path: directory },
    );
  }

  for (const key of OPTIONAL_LAYOUTS) {
    if (typeof layouts[key] !== 'function') {
      layouts[key] = indexLayout;
      diagnostics.push({
        code: 'MISSING_LAYOUT',
        severity: 'warning',
        file: path.join(directory, 'theme.yaml'),
        message: `主题缺少 ${key} 布局，已回退到 index`,
      });
    }
  }

  return {
    directory,
    manifest: loaded.manifest,
    definition: {
      ...original,
      layouts,
    },
    entryPath: loaded.entryPath,
    diagnostics,
  };
}
