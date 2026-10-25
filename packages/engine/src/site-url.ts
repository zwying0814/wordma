export function siteBasePrefix(basePath: string): string {
  return basePath && basePath !== '/'
    ? `/${basePath.replace(/^\/+|\/+$/g, '')}`
    : '';
}

export function absoluteSiteUrl(
  siteUrl: string | undefined,
  basePath: string,
  routePath: string,
): string | undefined {
  if (!siteUrl) return undefined;

  const origin = siteUrl.replace(/\/+$/g, '');
  const path = routePath.startsWith('/')
    ? routePath
    : `/${routePath}`;

  return `${origin}${siteBasePrefix(basePath)}${path}`;
}

export function absoluteAssetUrl(
  siteUrl: string | undefined,
  url: string,
): string | undefined {
  if (!siteUrl) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;

  return `${siteUrl.replace(/\/+$/g, '')}${
    url.startsWith('/') ? url : `/${url}`
  }`;
}
