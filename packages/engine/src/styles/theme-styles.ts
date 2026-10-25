import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type { ThemeStyles } from '@wordma/theme';

import { assetUrl } from '../assets';
import type { BuildCache } from '../cache/build-cache';
import { ThemeError } from '../errors';
import type { ThemeRuntime } from '../theme/runtime';
import {
  CSS_TARGETS,
  applyBasePathToCssUrls,
  compileCssFile,
} from './css';

export type ThemeStylesAsset = {
  url: string;
  /** dist 内相对路径（POSIX） */
  path: string;
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
  cache?: BuildCache;
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
function collectStyleGraph(
  files: string[],
  themeDir: string,
  visited: Set<string>,
  output: Array<{ path: string; hash: string }>,
): void {
  for (const file of files) {
    if (visited.has(file)) continue;
    visited.add(file);

    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    output.push({
      path: path
        .relative(themeDir, file)
        .split(path.sep)
        .join('/'),
      hash: contentHash(source),
    });

    const imports: string[] = [];
    for (const match of source.matchAll(CSS_IMPORT)) {
      const specifier = match[1];
      if (
        !specifier ||
        isRemoteImport(specifier) ||
        specifier.startsWith('tailwindcss') ||
        !specifier.startsWith('.')
      ) {
        continue;
      }

      const imported = path.resolve(
        path.dirname(file),
        specifier,
      );
      if (isInside(themeDir, imported)) {
        imports.push(imported);
      }
    }

    collectStyleGraph(
      imports,
      themeDir,
      visited,
      output,
    );
  }
}

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

  const themeDir = realpathSync(
    options.themeRuntime.directory,
  );
  const graph: Array<{ path: string; hash: string }> = [];
  collectStyleGraph(
    files,
    themeDir,
    new Set(),
    graph,
  );
  graph.sort((a, b) => a.path.localeCompare(b.path));

  const cacheKey =
    options.cache?.enabled
      ? options.cache.hash({
          basePath: options.basePath ?? '',
          targets: CSS_TARGETS,
          order: files.map((file) =>
            path
              .relative(themeDir, file)
              .split(path.sep)
              .join('/'),
          ),
          graph,
        })
      : undefined;

  if (options.cache && cacheKey) {
    const entry = options.cache.getEntry('css', cacheKey);

    if (
      entry &&
      typeof entry.meta.file === 'string' &&
      typeof entry.meta.hash === 'string' &&
      typeof entry.meta.bytes === 'number'
    ) {
      const filePath = path.join(
        entry.dir,
        entry.meta.file,
      );

      if (existsSync(filePath)) {
        return {
          css: {
            url: assetUrl(
              options.basePath,
              `assets/css/${entry.meta.file}`,
            ),
            path: `assets/css/${entry.meta.file}`,
            filePath,
            bytes: entry.meta.bytes,
            sources: Array.isArray(entry.meta.sources)
              ? entry.meta.sources.filter(
                  (item): item is string =>
                    typeof item === 'string',
                )
              : [],
          },
        };
      }
    }
  }

  const chunks: string[] = [];

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

  const css = applyBasePathToCssUrls(
    chunks.join('\n'),
    options.basePath,
  );
  const hash = contentHash(css);
  const cacheDir = path.resolve(options.cacheDir);
  const file = `theme-${hash}.css`;
  const filePath = path.join(cacheDir, file);
  const bytes = new TextEncoder().encode(css).length;
  const sources = files.map((item) =>
    path
      .relative(themeDir, item)
      .split(path.sep)
      .join('/'),
  );

  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(filePath, css);

  if (options.cache && cacheKey) {
    options.cache.putEntry(
      'css',
      cacheKey,
      {
        file,
        hash,
        bytes,
        sources,
      },
      [{ name: file, source: filePath }],
    );
  }

  return {
    css: {
      url: assetUrl(
        options.basePath,
        `assets/css/${file}`,
      ),
      path: `assets/css/${file}`,
      filePath,
      bytes,
      sources,
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
