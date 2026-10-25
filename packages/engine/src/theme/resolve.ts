import { existsSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_THEME_ID = 'wordma-theme-default';

/**
 * 解析主题目录。
 *
 * 顺序：
 * 1. workspace/themes/<themeId>
 * 2. workspace/node_modules/<themeId>
 * 3. 开发仓库内置 themes/default
 *
 * 发布后的引擎应把默认主题作为依赖提供；这里的相对路径仅用于当前 monorepo。
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
    candidates.push(
      path.resolve(
        import.meta.dirname,
        '../../../../themes/default',
      ),
    );
  }

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'theme.yaml'))) {
      return candidate;
    }
  }

  return null;
}
