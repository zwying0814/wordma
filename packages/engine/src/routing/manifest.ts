import type {
  ContentDiagnostic,
  ThemeManifest,
  Workspace,
} from '@wordma/content';

import { RouteError } from '../errors';

export type RouteKind =
  | 'index'
  | 'post'
  | 'page'
  | 'archive'
  | 'taxonomy'
  | 'theme-page'
  | 'not-found';

export type RouteTaxonomy = {
  kind: 'categories' | 'tags' | 'category' | 'tag';
  slug?: string;
};

export type Route = {
  path: string;
  output: string;
  kind: RouteKind;
  layout: string;
  entryId?: string;
  themePageId?: string;
  pageTypeId?: string;
  page?: number;
  totalPages?: number;
  pageSize?: number;
  taxonomy?: RouteTaxonomy;
};

export type RouteManifest = {
  routes: Route[];
  diagnostics: ContentDiagnostic[];
};

function normalizePath(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('/')) {
    throw new RouteError(
      'INVALID_ROUTE_PATTERN',
      `路由必须以 / 开头：${value}`,
    );
  }

  if (/[?#]/.test(trimmed)) {
    throw new RouteError(
      'INVALID_ROUTE_PATTERN',
      `路由不能包含 query 或 hash：${value}`,
    );
  }

  const segments = trimmed.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new RouteError(
      'INVALID_ROUTE_PATTERN',
      `路由不能包含 . 或 ..：${value}`,
    );
  }

  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

function fillPattern(
  pattern: string,
  params: Record<string, string>,
): string {
  const filled = pattern.replace(
    /\[([a-zA-Z0-9_]+)\]/g,
    (_match, key: string) => {
      const value = params[key];
      if (!value) {
        throw new RouteError(
          'INVALID_ROUTE_PATTERN',
          `路由 ${pattern} 缺少参数 [${key}]`,
        );
      }
      return value;
    },
  );

  return normalizePath(filled);
}

function outputFor(path: string, kind: RouteKind): string {
  if (kind === 'not-found') return '404.html';

  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/index.html` : 'index.html';
}

function makeRoute(
  path: string,
  kind: RouteKind,
  layout: string,
  extra: Omit<Route, 'path' | 'output' | 'kind' | 'layout'> = {},
): Route {
  const normalized = normalizePath(path);
  return {
    path: normalized,
    output: outputFor(normalized, kind),
    kind,
    layout,
    ...extra,
  };
}

export function buildRouteManifest(
  workspace: Workspace,
  themeManifest: ThemeManifest,
): RouteManifest {
  const routes: Route[] = [];
  const sources = new Map<string, string>();

  const add = (route: Route, source: string): void => {
    const existing = sources.get(route.path);
    if (existing) {
      throw new RouteError(
        'ROUTE_CONFLICT',
        `路由冲突：${route.path}（${existing} 与 ${source}）`,
        {
          path: route.path,
          sources: [existing, source],
        },
      );
    }

    sources.set(route.path, source);
    routes.push(route);
  };

  const siteRoutes = workspace.site.routes;
  const pageSize = workspace.site.pagination.pageSize;
  const posts = workspace.index.collections.posts?.entries ?? [];

  // 首页与分页
  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  for (let page = 1; page <= totalPages; page += 1) {
    const path =
      page === 1
        ? '/'
        : fillPattern(siteRoutes.pagination, {
            page: String(page),
          });

    add(
      makeRoute(path, 'index', 'index', {
        page,
        totalPages,
        pageSize,
      }),
      page === 1 ? 'index' : `pagination:${page}`,
    );
  }

  // 文章
  for (const entry of posts) {
    add(
      makeRoute(
        fillPattern(siteRoutes.post, { slug: entry.meta.slug }),
        'post',
        'post',
        { entryId: entry.id },
      ),
      `post:${entry.id}`,
    );
  }

  const pageTypes = themeManifest.content?.pageTypes ?? {};

  // pages collection
  for (const entry of workspace.index.collections.pages?.entries ?? []) {
    const pageType = entry.meta.type
      ? pageTypes[entry.meta.type]
      : undefined;

    if (pageType && !pageType.collection) {
      add(
        makeRoute(
          fillPattern(pageType.route, { slug: entry.meta.slug }),
          'page',
          pageType.layout,
          {
            entryId: entry.id,
            pageTypeId: entry.meta.type,
          },
        ),
        `page-type:${entry.meta.type}:${entry.id}`,
      );
      continue;
    }

    add(
      makeRoute(
        fillPattern(siteRoutes.page, { slug: entry.meta.slug }),
        'page',
        'page',
        { entryId: entry.id },
      ),
      `page:${entry.id}`,
    );
  }

  // 自定义 collection
  for (const [collectionName, collection] of Object.entries(
    workspace.index.collections,
  )) {
    if (collectionName === 'posts' || collectionName === 'pages') {
      continue;
    }

    const pageTypeEntry = Object.entries(pageTypes).find(
      ([, declaration]) =>
        declaration.collection === collectionName,
    );

    for (const entry of collection.entries) {
      if (pageTypeEntry) {
        const [pageTypeId, declaration] = pageTypeEntry;
        add(
          makeRoute(
            fillPattern(declaration.route, {
              slug: entry.meta.slug,
            }),
            'page',
            declaration.layout,
            {
              entryId: entry.id,
              pageTypeId,
            },
          ),
          `collection-page-type:${pageTypeId}:${entry.id}`,
        );
        continue;
      }

      add(
        makeRoute(
          fillPattern(siteRoutes.collection, {
            collection: collectionName,
            slug: entry.meta.slug,
          }),
          'page',
          'page',
          { entryId: entry.id },
        ),
        `collection:${collectionName}:${entry.id}`,
      );
    }
  }

  // 主题静态页
  for (const page of themeManifest.pages ?? []) {
    add(
      makeRoute(
        fillPattern(page.path, {}),
        'theme-page',
        page.layout,
        {
          themePageId: page.id,
        },
      ),
      `theme-page:${page.id}`,
    );
  }

  // 归档
  add(
    makeRoute(siteRoutes.archive, 'archive', 'archive'),
    'archive',
  );

  // Taxonomy 总览
  add(
    makeRoute(siteRoutes.categories, 'taxonomy', 'taxonomy', {
      taxonomy: { kind: 'categories' },
    }),
    'taxonomy:categories',
  );
  add(
    makeRoute(siteRoutes.tags, 'taxonomy', 'taxonomy', {
      taxonomy: { kind: 'tags' },
    }),
    'taxonomy:tags',
  );

  // Taxonomy 详情
  for (const term of workspace.index.categories) {
    add(
      makeRoute(
        fillPattern(siteRoutes.category, { slug: term.slug }),
        'taxonomy',
        'taxonomy',
        {
          taxonomy: { kind: 'category', slug: term.slug },
        },
      ),
      `taxonomy:category:${term.slug}`,
    );
  }

  for (const term of workspace.index.tags) {
    add(
      makeRoute(
        fillPattern(siteRoutes.tag, { slug: term.slug }),
        'taxonomy',
        'taxonomy',
        {
          taxonomy: { kind: 'tag', slug: term.slug },
        },
      ),
      `taxonomy:tag:${term.slug}`,
    );
  }

  // 404
  add(
    makeRoute('/404/', 'not-found', 'notFound'),
    'not-found',
  );

  routes.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  return {
    routes,
    diagnostics: [...workspace.diagnostics],
  };
}
