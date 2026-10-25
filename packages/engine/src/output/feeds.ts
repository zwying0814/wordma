import { writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  ContentDiagnostic,
  ContentEntry,
  SiteMeta,
} from '@wordma/content';

import type { Route } from '../routing/manifest';
import { absoluteSiteUrl } from '../site-url';

export type BuildFeedsOptions = {
  site: SiteMeta;
  routes: Route[];
  posts: ContentEntry[];
  entriesById: Map<string, ContentEntry>;
  excerpts?: Map<string, string>;
  outDir: string;
  /** dist 中已有的静态文件路径（POSIX） */
  staticPaths?: Set<string>;
};

export type FeedFile = {
  path: string;
  kind: 'feed';
  bytes: number;
};

export type FeedResult = {
  files: FeedFile[];
  diagnostics: ContentDiagnostic[];
  rss?: string;
  sitemap?: string;
  robots: string;
};

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function dateOnly(value: string | undefined): string | undefined {
  const match = value
    ? /^(\d{4}-\d{2}-\d{2})/.exec(value)
    : null;

  return match?.[1];
}

function rfc822(ms: number | undefined): string | undefined {
  return ms === undefined
    ? undefined
    : new Date(ms).toUTCString();
}

function buildRss(
  options: BuildFeedsOptions,
  posts: ContentEntry[],
): string {
  const { site, excerpts } = options;
  const link = absoluteSiteUrl(
    site.url,
    site.basePath,
    '/',
  ) as string;
  const latest = posts.reduce<number | undefined>(
    (max, entry) =>
      entry.dateMs === undefined
        ? max
        : max === undefined
          ? entry.dateMs
          : Math.max(max, entry.dateMs),
    undefined,
  );
  const lastBuildDate = rfc822(latest);
  const items = posts.map((entry) => {
    const entryRoute = options.routes.find(
      (route) => route.entryId === entry.id,
    );
    const entryUrl = entryRoute
      ? absoluteSiteUrl(
          site.url,
          site.basePath,
          entryRoute.path,
        )
      : undefined;
    const description =
      excerpts?.get(entry.id) ??
      entry.meta.description ??
      entry.meta.title;
    const pubDate = rfc822(entry.dateMs);

    return [
      '    <item>',
      `      <title>${xml(entry.meta.title)}</title>`,
      entryUrl
        ? `      <link>${xml(entryUrl)}</link>`
        : '',
      entryUrl
        ? `      <guid isPermaLink="true">${xml(entryUrl)}</guid>`
        : '',
      pubDate
        ? `      <pubDate>${pubDate}</pubDate>`
        : '',
      `      <description>${xml(description)}</description>`,
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${xml(site.title)}</title>`,
    `    <link>${xml(link)}</link>`,
    `    <description>${xml(site.description ?? site.title)}</description>`,
    `    <language>${xml(site.language)}</language>`,
    lastBuildDate
      ? `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`
      : '',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function buildSitemap(
  options: BuildFeedsOptions,
): string {
  const { site, routes, entriesById } = options;
  const entries: string[] = [];

  for (const route of routes) {
    if (route.kind === 'not-found') continue;

    const url = absoluteSiteUrl(
      site.url,
      site.basePath,
      route.path,
    );
    if (!url) continue;

    const entry = route.entryId
      ? entriesById.get(route.entryId)
      : undefined;
    const lastmod = dateOnly(
      entry?.meta.updated ?? entry?.meta.date,
    );

    entries.push(
      [
        '  <url>',
        `    <loc>${xml(url)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

function buildRobots(
  sitemapUrl: string | undefined,
): string {
  const lines = ['User-agent: *', 'Allow: /'];

  if (sitemapUrl) {
    lines.push('', `Sitemap: ${sitemapUrl}`);
  }

  return `${lines.join('\n')}\n`;
}

export function writeFeeds(
  options: BuildFeedsOptions,
): FeedResult {
  const diagnostics: ContentDiagnostic[] = [];
  const files: FeedFile[] = [];
  const staticPaths = options.staticPaths ?? new Set<string>();

  if (!options.site.url) {
    diagnostics.push({
      code: 'MISSING_SITE_URL',
      severity: 'warning',
      message:
        '未配置 site.url，已跳过 RSS 与 sitemap；robots 不输出 Sitemap 行',
    });
  }

  const posts = [...options.posts].sort((a, b) => {
    const dateDiff = (b.dateMs ?? 0) - (a.dateMs ?? 0);
    return dateDiff !== 0
      ? dateDiff
      : a.id.localeCompare(b.id);
  });

  let rss: string | undefined;
  let sitemap: string | undefined;
  const sitemapUrl = absoluteSiteUrl(
    options.site.url,
    options.site.basePath,
    '/sitemap.xml',
  );

  if (options.site.url && posts.length > 0) {
    rss = buildRss(options, posts);
  }

  if (options.site.url) {
    sitemap = buildSitemap(options);
  }

  const robots = buildRobots(sitemapUrl);

  const outputs: Array<[string, string | undefined]> = [
    ['rss.xml', rss],
    ['sitemap.xml', sitemap],
    ['robots.txt', robots],
  ];

  for (const [name, content] of outputs) {
    if (!content) continue;

    if (staticPaths.has(name)) {
      diagnostics.push({
        code: 'STATIC_CONFLICT',
        severity: 'warning',
        path: name,
        message: `生成文件覆盖静态资源：${name}`,
      });
    }

    writeFileSync(path.join(options.outDir, name), content);
    files.push({
      path: name,
      kind: 'feed',
      bytes: new TextEncoder().encode(content).length,
    });
  }

  return {
    files,
    diagnostics,
    ...(rss ? { rss: 'rss.xml' } : {}),
    ...(sitemap ? { sitemap: 'sitemap.xml' } : {}),
    robots: 'robots.txt',
  };
}
