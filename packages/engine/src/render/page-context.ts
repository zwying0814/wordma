import type {
  ContentEntry,
  AssetRef,
  PageMeta,
  PageSummary,
  PostSummary,
  TaxonomyTerm,
  ThemeManifest,
  Workspace,
} from '@wordma/content';
import { normalizeSlug } from '@wordma/content';
import type {
  ArchiveGroup,
  PageContext,
  PaginationInfo,
  TaxonomyView,
} from '@wordma/theme';

import type {
  Route,
  RouteManifest,
} from '../routing/manifest';
import type { CompiledContent } from '../mdx/compile';
import { buildSeo } from './seo';

export type CreatePageContextOptions = {
  route: Route;
  workspace: Workspace;
  routeManifest: RouteManifest;
  themeManifest: ThemeManifest;
  compiledContent?: CompiledContent;
  contentAssets?: AssetRef[];
  contentCover?: AssetRef;
};

type UrlMaps = {
  entries: Map<string, string>;
  indexPages: Map<number, string>;
  categoryTerms: Map<string, string>;
  tagTerms: Map<string, string>;
};

function joinUrl(basePath: string, path: string): string {
  if (
    path.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(path)
  ) {
    return path;
  }

  const base =
    basePath && basePath !== '/'
      ? basePath.replace(/\/+$/g, '')
      : '';
  const normalized = path.startsWith('/') ? path : `/${path}`;

  return `${base}${normalized}` || '/';
}

function buildUrlMaps(routes: Route[]): UrlMaps {
  const maps: UrlMaps = {
    entries: new Map(),
    indexPages: new Map(),
    categoryTerms: new Map(),
    tagTerms: new Map(),
  };

  for (const route of routes) {
    if (route.entryId) {
      maps.entries.set(route.entryId, route.path);
    }

    if (route.kind === 'index' && route.page) {
      maps.indexPages.set(route.page, route.path);
    }

    if (route.kind !== 'taxonomy' || !route.taxonomy) continue;

    const { kind, slug } = route.taxonomy;
    if (kind === 'category' && slug) {
      maps.categoryTerms.set(slug, route.path);
    } else if (kind === 'tag' && slug) {
      maps.tagTerms.set(slug, route.path);
    }
  }

  return maps;
}

function toSummary(
  entry: ContentEntry,
  entryUrls: Map<string, string>,
): PostSummary {
  return {
    id: entry.id,
    slug: entry.meta.slug,
    title: entry.meta.title,
    date: entry.meta.date,
    description: entry.meta.description,
    tags: entry.meta.tags,
    categories: entry.meta.categories,
    draft: entry.meta.draft,
    cover: entry.meta.cover,
    url: entryUrls.get(entry.id),
  };
}

function syntheticPage(
  route: Route,
  workspace: Workspace,
  themeManifest: ThemeManifest,
): PageMeta {
  const base = (title: string, slug: string): PageMeta => ({
    id: `route:${route.path}`,
    kind: 'page',
    title,
    slug,
    tags: [],
    categories: [],
    draft: false,
    data: {},
  });

  switch (route.kind) {
    case 'index':
      return base(workspace.site.site.title, 'index');

    case 'archive':
      return base('归档', 'archive');

    case 'taxonomy': {
      const kind = route.taxonomy?.kind;
      if (kind === 'categories') return base('分类', 'categories');
      if (kind === 'tags') return base('标签', 'tags');

      const slug = route.taxonomy?.slug ?? 'taxonomy';
      const term =
        kind === 'category'
          ? workspace.index.categories.find(
              (item) => item.slug === slug,
            )
          : workspace.index.tags.find((item) => item.slug === slug);

      return base(term?.name ?? 'Taxonomy', slug);
    }

    case 'theme-page': {
      const page = themeManifest.pages?.find(
        (item) => item.id === route.themePageId,
      );
      const id = page?.id ?? route.themePageId ?? 'page';

      return base(id, id);
    }

    case 'not-found':
      return base('404', '404');

    default:
      return base(workspace.site.site.title, 'page');
  }
}

function entriesForTerm(
  entries: ContentEntry[],
  kind: 'category' | 'tag',
  slug: string,
): ContentEntry[] {
  return entries.filter((entry) => {
    const values =
      kind === 'category'
        ? entry.meta.categories
        : entry.meta.tags;

    return values.some((name) => {
      try {
        return normalizeSlug(name) === slug;
      } catch {
        return false;
      }
    });
  });
}

function buildArchive(
  entries: ContentEntry[],
  entryUrls: Map<string, string>,
): ArchiveGroup[] {
  const groups = new Map<string, PostSummary[]>();

  for (const entry of entries) {
    const year =
      /^\d{4}/.exec(entry.meta.date ?? '')?.[0] ?? 'Unknown';
    const list = groups.get(year) ?? [];
    list.push(toSummary(entry, entryUrls));
    groups.set(year, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return b.localeCompare(a);
    })
    .map(([year, posts]) => ({ year, posts }));
}

export function createPageContext(
  options: CreatePageContextOptions,
): PageContext {
  const {
    route,
    workspace,
    routeManifest,
    themeManifest,
    compiledContent,
    contentAssets,
    contentCover,
  } = options;
  const maps = buildUrlMaps(routeManifest.routes);
  const url = (path: string): string =>
    joinUrl(workspace.site.site.basePath, path);
  const helpers = {
    url,
    asset: url,
    t: (key: string): string => key,
  };

  const entry = route.entryId
    ? workspace.index.entries.find(
        (item) => item.id === route.entryId,
      )
    : undefined;

  const page = entry
    ? entry.meta
    : syntheticPage(route, workspace, themeManifest);

  const posts: PostSummary[] = (
    workspace.index.collections.posts?.entries ?? []
  ).map((item) => toSummary(item, maps.entries));
  const pages: PageSummary[] = (
    workspace.index.collections.pages?.entries ?? []
  ).map((item) => toSummary(item, maps.entries));

  const tags: TaxonomyTerm[] = workspace.index.tags.map((term) => ({
    ...term,
    url: maps.tagTerms.get(term.slug),
  }));
  const categories: TaxonomyTerm[] = workspace.index.categories.map(
    (term) => ({
      ...term,
      url: maps.categoryTerms.get(term.slug),
    }),
  );

  let pagination: PaginationInfo | undefined;

  if (route.kind === 'index' && route.page) {
    const prevPath = maps.indexPages.get(route.page - 1);
    const nextPath = maps.indexPages.get(route.page + 1);

    pagination = {
      currentPage: route.page,
      totalPages: route.totalPages ?? 1,
      pageSize:
        route.pageSize ?? workspace.site.pagination.pageSize,
      prevUrl: prevPath ? url(prevPath) : undefined,
      nextUrl: nextPath ? url(nextPath) : undefined,
    };
  }

  let taxonomyView: TaxonomyView | undefined;

  if (route.kind === 'taxonomy' && route.taxonomy) {
    const { kind, slug } = route.taxonomy;

    if (kind === 'categories' || kind === 'tags') {
      taxonomyView = { kind };
    } else if (slug) {
      const term =
        kind === 'category'
          ? categories.find((item) => item.slug === slug)
          : tags.find((item) => item.slug === slug);

      if (term) {
        const termEntries = entriesForTerm(
          workspace.index.entries,
          kind,
          slug,
        );

        taxonomyView = {
          kind,
          term,
          posts: termEntries.map((item) =>
            toSummary(item, maps.entries),
          ),
        };
      }
    }
  }

  const archive =
    route.kind === 'archive'
      ? buildArchive(
          workspace.index.collections.posts?.entries ?? [],
          maps.entries,
        )
      : undefined;

  const seo = buildSeo({
    site: workspace.site.site,
    route,
    page,
    excerpt: compiledContent?.excerpt,
    cover: contentCover,
  });

  return {
    site: workspace.site.site,
    page,
    seo,
    content: {
      html: compiledContent?.html ?? '',
      headings: compiledContent?.headings ?? [],
      islands: (compiledContent?.islands ?? []).map(
        (island) => ({
          name: island.name,
          source: island.relativeSource,
          exportName: island.exportName,
          props: island.props,
          js: island.js,
          css: island.css,
        }),
      ),
      assets:
        contentAssets ?? entry?.assets ?? [],
      ...(contentCover ? { cover: contentCover } : {}),
      excerpt:
        compiledContent?.excerpt ?? entry?.meta.description,
    },
    collections: {
      posts,
      pages,
    },
    taxonomy: {
      tags,
      categories,
      ...(taxonomyView ? { view: taxonomyView } : {}),
    },
    navigation: workspace.site.navigation,
    theme: workspace.site.theme.settings,
    helpers,
    ...(pagination ? { pagination } : {}),
    ...(archive ? { archive } : {}),
  };
}
