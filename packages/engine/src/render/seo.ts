import type {
  AssetRef,
  PageMeta,
  SiteMeta,
} from '@wordma/content';
import type { SeoMeta } from '@wordma/theme';

import type { Route } from '../routing/manifest';

export type BuildSeoOptions = {
  site: SiteMeta;
  route: Route;
  page: PageMeta;
  excerpt?: string;
  cover?: AssetRef;
};

function trimText(
  value: string | undefined,
): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function basePrefix(basePath: string): string {
  return basePath && basePath !== '/'
    ? `/${basePath.replace(/^\/+|\/+$/g, '')}`
    : '';
}

function absolutePageUrl(
  siteUrl: string | undefined,
  basePath: string,
  routePath: string,
): string | undefined {
  if (!siteUrl) return undefined;

  const origin = siteUrl.replace(/\/+$/g, '');
  const path = routePath.startsWith('/')
    ? routePath
    : `/${routePath}`;

  return `${origin}${basePrefix(basePath)}${path}`;
}

function absoluteAssetUrl(
  siteUrl: string | undefined,
  url: string,
): string | undefined {
  if (!siteUrl) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;

  return `${siteUrl.replace(/\/+$/g, '')}${
    url.startsWith('/') ? url : `/${url}`
  }`;
}

export function buildSeo(options: BuildSeoOptions): SeoMeta {
  const { site, route, page, excerpt, cover } = options;
  const title =
    page.title && page.title !== site.title
      ? `${page.title} · ${site.title}`
      : site.title;
  const description =
    trimText(page.description) ??
    trimText(excerpt) ??
    trimText(site.description);
  const canonical = absolutePageUrl(
    site.url,
    site.basePath,
    route.path,
  );
  const type = route.entryId ? 'article' : 'website';
  const image = cover
    ? absoluteAssetUrl(site.url, cover.url)
    : undefined;

  return {
    title,
    ...(description ? { description } : {}),
    ...(canonical ? { canonical } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      type,
      ...(canonical ? { url: canonical } : {}),
      ...(image ? { image } : {}),
      siteName: site.title,
      locale: site.language,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
    },
  };
}
