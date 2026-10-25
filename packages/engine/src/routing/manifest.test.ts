import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import {
  loadWorkspace,
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';

import { RouteError, buildRouteManifest } from '../index';
import type { RouteManifest } from '../index';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

function loadTheme(relativePath: string) {
  return parseThemeManifest(
    parseYamlFile(path.join(repoRoot, relativePath)),
  );
}

function routeByPath(manifest: RouteManifest, routePath: string) {
  return manifest.routes.find((route) => route.path === routePath);
}

function expectRouteError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RouteError);
    expect((error as RouteError).code).toBe(code);
    return;
  }

  throw new Error(`预期抛出 RouteError(${code})`);
}

describe('buildRouteManifest', () => {
  it('为 content-layer 生成完整路由', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/content-layer'),
    );
    const theme = loadTheme('themes/default/theme.yaml');
    const manifest = buildRouteManifest(workspace, theme);

    expect(manifest.routes).toHaveLength(17);
    expect(manifest.diagnostics).toEqual(workspace.diagnostics);

    const home = routeByPath(manifest, '/');
    expect(home?.kind).toBe('index');
    expect(home?.layout).toBe('index');
    expect(home?.output).toBe('index.html');
    expect(home?.page).toBe(1);
    expect(home?.totalPages).toBe(2);
    expect(home?.pageSize).toBe(1);

    const page2 = routeByPath(manifest, '/page/2/');
    expect(page2?.kind).toBe('index');
    expect(page2?.output).toBe('page/2/index.html');
    expect(page2?.page).toBe(2);

    const post = routeByPath(
      manifest,
      '/posts/standalone-post/',
    );
    expect(post?.kind).toBe('post');
    expect(post?.layout).toBe('post');
    expect(post?.entryId).toBe('posts/standalone');
    expect(post?.output).toBe(
      'posts/standalone-post/index.html',
    );

    expect(
      routeByPath(manifest, '/posts/folder/')?.entryId,
    ).toBe('posts/folder');

    const page = routeByPath(manifest, '/about/');
    expect(page?.kind).toBe('page');
    expect(page?.layout).toBe('page');
    expect(page?.entryId).toBe('pages/about');

    const project = routeByPath(manifest, '/projects/demo/');
    expect(project?.kind).toBe('page');
    expect(project?.layout).toBe('page');
    expect(project?.entryId).toBe('projects/demo');

    expect(routeByPath(manifest, '/archive/')?.layout).toBe(
      'archive',
    );
    expect(
      routeByPath(manifest, '/categories/')?.taxonomy,
    ).toEqual({ kind: 'categories' });
    expect(routeByPath(manifest, '/tags/')?.taxonomy).toEqual({
      kind: 'tags',
    });
    expect(
      routeByPath(manifest, '/category/notes/')?.taxonomy,
    ).toEqual({ kind: 'category', slug: 'notes' });
    expect(
      routeByPath(manifest, '/tag/alpha/')?.taxonomy,
    ).toEqual({ kind: 'tag', slug: 'alpha' });

    const notFound = routeByPath(manifest, '/404/');
    expect(notFound?.kind).toBe('not-found');
    expect(notFound?.layout).toBe('notFound');
    expect(notFound?.output).toBe('404.html');
  });

  it('应用 pageTypes 与主题静态页', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/custom-pages'),
    );
    const theme = loadTheme(
      'fixtures/custom-pages/themes/wordma-theme-custom-pages/theme.yaml',
    );
    const manifest = buildRouteManifest(workspace, theme);

    const about = routeByPath(manifest, '/about/');
    expect(about?.layout).toBe('about');
    expect(about?.entryId).toBe('pages/about');
    expect(about?.pageTypeId).toBe('about');

    const project = routeByPath(manifest, '/projects/demo/');
    expect(project?.layout).toBe('project');
    expect(project?.entryId).toBe('projects/demo');
    expect(project?.pageTypeId).toBe('project');

    const search = routeByPath(manifest, '/search/');
    expect(search?.kind).toBe('theme-page');
    expect(search?.layout).toBe('search');
    expect(search?.themePageId).toBe('search');

    expect(manifest.routes.filter((route) => route.kind === 'index')).toHaveLength(
      1,
    );
  });

  it('拒绝主题静态页中的动态占位符', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/minimal'),
    );
    const base = loadTheme('themes/default/theme.yaml');
    const theme = parseThemeManifest({
      ...base,
      pages: [
        {
          id: 'bad',
          path: '/bad/[slug]',
          layout: 'bad',
        },
      ],
    });

    expectRouteError(
      () => buildRouteManifest(workspace, theme),
      'INVALID_ROUTE_PATTERN',
    );
  });

  it('路由冲突时报 ROUTE_CONFLICT', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/broken/route-conflict'),
    );
    const theme = loadTheme(
      'fixtures/broken/route-conflict/themes/wordma-theme-route-conflict/theme.yaml',
    );

    expectRouteError(
      () => buildRouteManifest(workspace, theme),
      'ROUTE_CONFLICT',
    );
  });

  it('支持覆盖文章路由模式', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/content-layer'),
    );
    const theme = loadTheme('themes/default/theme.yaml');
    const custom = {
      ...workspace,
      site: {
        ...workspace.site,
        routes: {
          ...workspace.site.routes,
          post: '/blog/[slug]/',
        },
      },
    };

    const manifest = buildRouteManifest(custom, theme);
    expect(
      routeByPath(manifest, '/blog/standalone-post/')?.entryId,
    ).toBe('posts/standalone');
    expect(
      routeByPath(manifest, '/posts/standalone-post/'),
    ).toBeUndefined();
  });

  it('两次生成结果稳定', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/content-layer'),
    );
    const theme = loadTheme('themes/default/theme.yaml');
    const first = buildRouteManifest(workspace, theme);
    const second = buildRouteManifest(workspace, theme);

    expect(first.routes.map((route) => route.path)).toEqual(
      second.routes.map((route) => route.path),
    );
  });
});
