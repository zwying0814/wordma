import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ContentDiagnostic, ThemeManifest } from '@wordma/content';
import { loadThemePackage } from '@wordma/theme';
import type { ThemeDefinition } from '@wordma/theme';

import { ThemeError } from '../errors';
import {
  defaultThemeDirectory,
  resolveThemeDirectory,
} from './resolve';
import { assertThemeEngines } from './version';

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

const SHARED_THEME_MODULE =
  /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|@wordma\/theme|@wordma\/content)$/;

/**
 * 将 workspace 主题打成 ESM，并把 React / @wordma/theme 固定到
 * engine 正在使用的实例，避免主题自带副本导致 context/hooks 失配。
 */
async function bundleThemeEntry(
  themeEntry: string,
  root: string,
): Promise<string> {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), 'wordma-theme-runtime-'),
  );

  try {
    const result = await Bun.build({
      entrypoints: [themeEntry],
      outdir: tempDir,
      target: 'bun',
      format: 'esm',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      plugins: [
        {
          name: 'wordma-shared-theme-runtime',
          setup(build) {
            build.onResolve(
              { filter: SHARED_THEME_MODULE },
              (args) => {
                try {
                  return {
                    path: Bun.resolveSync(
                      args.path,
                      import.meta.dirname,
                    ),
                    external: true,
                  };
                } catch {
                  return undefined;
                }
              },
            );
          },
        },
      ],
    });

    if (!result.success) {
      const details = result.logs
        .map((log) => {
          const position = log.position;
          const location =
            position === undefined ||
            position === null
              ? ''
              : ` (${position.file}:${position.line}:${position.column})`;
          return `${log.level}: ${log.message}${location}`;
        })
        .join('\n');

      throw new Error(details || 'Bundle failed');
    }

    const output = result.outputs.find(
      (item) =>
        item.kind === 'entry-point' &&
        item.path.endsWith('.js'),
    );
    if (!output) {
      throw new Error('主题 bundle 未产出 JS');
    }

    const source = await output.text();
    const hash = createHash('sha256')
      .update(source)
      .digest('hex')
      .slice(0, 16);
    const cacheDir = path.join(
      root,
      '.wordma/cache/v1/theme-runtime',
    );
    const bundled = path.join(cacheDir, `theme-${hash}.mjs`);

    if (!existsSync(bundled)) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(bundled, source);
    }

    return bundled;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function importThemeModule(
  entryPath: string,
  directory: string,
  root: string,
): Promise<{ default?: unknown }> {
  const builtin = defaultThemeDirectory();
  const useDirect =
    builtin !== null &&
    path.resolve(directory) === path.resolve(builtin);

  if (useDirect) {
    return (await import(
      pathToFileURL(entryPath).href
    )) as { default?: unknown };
  }

  const bundled = await bundleThemeEntry(entryPath, root);

  return (await import(
    pathToFileURL(bundled).href
  )) as { default?: unknown };
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

  assertThemeEngines(loaded.manifest, {
    themeId,
    path: directory,
  });

  let module: { default?: unknown };

  try {
    module = await importThemeModule(
      loaded.entryPath,
      directory,
      root,
    );
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
