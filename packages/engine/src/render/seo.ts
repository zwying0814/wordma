import type {
  AssetRef,
  PageMeta,
  SiteMeta,
} from '@wordma/content';
import type { SeoMeta } from '@wordma/theme';

import type { Route } from '../routing/manifest';
import {
  absoluteAssetUrl,
  absoluteSiteUrl,
} from '../site-url';

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
  const canonical = absoluteSiteUrl(
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
