import { existsSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_THEME_ID = 'wordma-theme-default';

/**
 * 内置默认主题目录。
 *
 * 优先级：
 * 1. WORDMA_DEFAULT_THEME_DIR
 * 2. WORDMA_ENGINE_ROOT/themes/default
 * 3. monorepo 开发目录（仅开发环境存在）
 */
export function defaultThemeDirectory(): string | null {
  const candidates = [
    process.env.WORDMA_DEFAULT_THEME_DIR,
    process.env.WORDMA_ENGINE_ROOT
      ? path.join(
          process.env.WORDMA_ENGINE_ROOT,
          'themes/default',
        )
      : undefined,
    path.resolve(
      import.meta.dirname,
      '../../../../themes/default',
    ),
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      existsSync(path.join(candidate, 'theme.yaml'))
    ) {
      return candidate;
    }
  }

  return null;
}

/**
 * 解析主题目录。
 *
 * 顺序：
 * 1. workspace/themes/<themeId>
 * 2. workspace/node_modules/<themeId>
 * 3. 内置默认主题
 */
export function resolveThemeDirectory(
  root: string,
  themeId: string,
): string | null {
  const candidates = [
    path.join(root, 'themes', themeId),
    path.join(root, 'node_modules', themeId),
  ];

  if (themeId === DEFAULT_THEME_ID) {
    const builtin = defaultThemeDirectory();
    if (builtin) candidates.push(builtin);
  }

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'theme.yaml'))) {
      return candidate;
    }
  }

  return null;
}
