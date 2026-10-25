import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type { ThemeStyles } from '@wordma/theme';

import { assetUrl } from '../assets';
import { ThemeError } from '../errors';
import type { ThemeRuntime } from '../theme/runtime';
import { compileCssFile } from './css';

export type ThemeStylesAsset = {
  url: string;
  filePath: string;
  bytes: number;
  sources: string[];
};

export type ThemeStylesResult = {
  css?: ThemeStylesAsset;
};

export type BuildThemeStylesOptions = {
  themeRuntime: ThemeRuntime;
  cacheDir: string;
  basePath?: string;
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

function contentHash(source: string): string {
  return createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, 8);
}

function resolveStyleFile(
  themeRuntime: ThemeRuntime,
  stylePath: string,
): string {
  const themeDir = realpathSync(themeRuntime.directory);
  const baseDir = path.dirname(
    realpathSync(themeRuntime.entryPath),
  );

  if (path.isAbsolute(stylePath)) {
    throw new ThemeError(
      'UNSAFE_STYLE',
      `主题样式必须使用相对路径：${stylePath}`,
      {
        themeId: themeRuntime.manifest.id,
        path: stylePath,
      },
    );
  }

  const candidate = path.resolve(baseDir, stylePath);

  if (!isInside(themeDir, candidate)) {
    throw new ThemeError(
      'UNSAFE_STYLE',
      `主题样式不能逃出主题目录：${stylePath}`,
      {
        themeId: themeRuntime.manifest.id,
        path: candidate,
      },
    );
  }

  let realPath: string;
  try {
    realPath = realpathSync(candidate);
  } catch {
    throw new ThemeError(
      'MISSING_STYLE',
      `主题样式不存在：${stylePath}`,
      {
        themeId: themeRuntime.manifest.id,
        path: candidate,
      },
    );
  }

  if (!isInside(themeDir, realPath)) {
    throw new ThemeError(
      'UNSAFE_STYLE',
      `主题样式解析到主题目录外：${stylePath}`,
      {
        themeId: themeRuntime.manifest.id,
        path: realPath,
      },
    );
  }

  if (path.extname(realPath).toLowerCase() !== '.css') {
    throw new ThemeError(
      'MISSING_STYLE',
      `主题样式必须是 .css 文件：${stylePath}`,
      {
        themeId: themeRuntime.manifest.id,
        path: realPath,
      },
    );
  }

  return realPath;
}

const TAILWIND_DIRECTIVE =
  /@tailwind\s+(?:base|components|utilities)\b/;
const TAILWIND_IMPORT =
  /@import\s+(?:url\(\s*)?["']tailwindcss(?:\/[^"']*)?["']/;
const CSS_IMPORT =
  /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;

function isRemoteImport(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('//') ||
    value.startsWith('data:')
  );
}

function assertNoTailwindDirectives(
  filePath: string,
  themeDir: string,
  themeId: string,
  visited: Set<string>,
): void {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  if (
    TAILWIND_DIRECTIVE.test(source) ||
    TAILWIND_IMPORT.test(source)
  ) {
    throw new ThemeError(
      'TAILWIND_PRECOMPILE_REQUIRED',
      [
        `主题使用了未预生成的 Tailwind 指令：${filePath}`,
        '请先运行：',
        '  bunx @tailwindcss/cli -i ./src/styles/app.css -o ./src/styles/generated.css --minify',
        '然后在 styles 中引用 generated.css。',
      ].join('\n'),
      { themeId, path: filePath },
    );
  }

  for (const match of source.matchAll(CSS_IMPORT)) {
    const specifier = match[1];
    if (
      !specifier ||
      isRemoteImport(specifier) ||
      specifier.startsWith('tailwindcss')
    ) {
      continue;
    }
    if (!specifier.startsWith('.')) continue;

    const imported = path.resolve(
      path.dirname(filePath),
      specifier,
    );
    if (!isInside(themeDir, imported)) continue;
    assertNoTailwindDirectives(
      imported,
      themeDir,
      themeId,
      visited,
    );
  }
}

export function themeStylePaths(
  styles: ThemeStyles | undefined,
): string[] {
  if (!styles) return [];

  if (Array.isArray(styles)) return styles;

  return [
    ...(styles.tokens ?? []),
    ...(styles.global ?? []),
    ...(styles.prose ?? []),
  ];
}

/**
 * 编译主题 styles：解析相对路径、打包 @import、压缩并生成内容 hash。
 */
export function buildThemeStyles(
  options: BuildThemeStylesOptions,
): ThemeStylesResult {
  const styles = themeStylePaths(
    options.themeRuntime.definition.styles,
  );
  if (styles.length === 0) return {};

  const seen = new Set<string>();
  const files: string[] = [];

  for (const style of styles) {
    const file = resolveStyleFile(
      options.themeRuntime,
      style,
    );
    if (seen.has(file)) continue;

    seen.add(file);
    files.push(file);
  }

  const chunks: string[] = [];
  const themeDir = realpathSync(
    options.themeRuntime.directory,
  );

  for (const file of files) {
    assertNoTailwindDirectives(
      file,
      themeDir,
      options.themeRuntime.manifest.id,
      new Set(),
    );

    try {
      chunks.push(compileCssFile(file));
    } catch (error) {
      throw new ThemeError(
        'CSS_BUILD_FAILED',
        `主题样式编译失败：${file}\n${error instanceof Error ? error.message : String(error)}`,
        {
          themeId: options.themeRuntime.manifest.id,
          path: file,
        },
      );
    }
  }

  const css = chunks.join('\n');
  const hash = contentHash(css);
  const cacheDir = path.resolve(options.cacheDir);
  const file = `theme-${hash}.css`;
  const filePath = path.join(cacheDir, file);

  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(filePath, css);

  return {
    css: {
      url: assetUrl(
        options.basePath,
        `assets/css/${file}`,
      ),
      filePath,
      bytes: new TextEncoder().encode(css).length,
      sources: files.map((item) =>
        path
          .relative(
            realpathSync(
              options.themeRuntime.directory,
            ),
            item,
          )
          .split(path.sep)
          .join('/'),
      ),
    },
  };
}

export function copyThemeStyles(
  outDir: string,
  result: ThemeStylesResult,
): void {
  if (!result.css) return;

  const targetDir = path.join(outDir, 'assets', 'css');
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(
    result.css.filePath,
    path.join(targetDir, path.basename(result.css.filePath)),
  );
}
