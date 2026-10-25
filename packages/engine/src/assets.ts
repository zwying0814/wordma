/**
 * 把 dist 内的相对资产路径转换为站点 URL。
 */
export function assetUrl(
  basePath: string | undefined,
  relativePath: string,
): string {
  const path = relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const base =
    basePath && basePath !== '/'
      ? `/${basePath.replace(/^\/+|\/+$/g, '')}`
      : '';

  return `${base}/${path}` || '/';
}
