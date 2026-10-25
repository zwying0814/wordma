import { ContentError } from './diagnostics';

/**
 * 归一化 slug：
 * - NFKC
 * - 空格/下划线转 -
 * - 保留 Unicode 字母和数字
 * - 移除路径分隔符和其他符号
 * - 合并连续的 -
 */
export function normalizeSlug(input: string): string {
  const normalized = input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    throw new ContentError(
      'INVALID_SLUG',
      `无法从 "${input}" 生成 slug`,
    );
  }

  return normalized;
}

/**
 * 从相对 content 目录的路径推导 slug。
 *
 * - `posts/hello.mdx` → hello
 * - `posts/hello/index.mdx` → hello
 * - `pages/about.md` → about
 */
export function slugFromEntry(relativeContentPath: string): string {
  const parts = relativeContentPath.split('/');
  const fileName = parts.at(-1) ?? '';
  const parent = parts.at(-2) ?? '';
  const raw = /^index\.(md|mdx)$/i.test(fileName)
    ? parent
    : fileName.replace(/\.(md|mdx)$/i, '');

  return normalizeSlug(raw);
}
