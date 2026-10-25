import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import {
  loadWorkspace,
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';

import {
  buildRouteManifest,
  createPageContext,
} from '../index';
import type {
  CreatePageContextOptions,
} from '../index';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

function loadTheme(relativePath: string) {
  return parseThemeManifest(
    parseYamlFile(path.join(repoRoot, relativePath)),
  );
}

function setup(fixture: string, themePath: string) {
  const workspace = loadWorkspace(path.join(repoRoot, fixture));
  const themeManifest = loadTheme(themePath);
  const routeManifest = buildRouteManifest(workspace, themeManifest);

  const contextFor = (routePath: string) => {
    const route = routeManifest.routes.find(
      (item) => item.path === routePath,
    );
    if (!route) throw new Error(`路由不存在：${routePath}`);

    const options: CreatePageContextOptions = {
      route,
      workspace,
      routeManifest,
      themeManifest,
    };

    return createPageContext(options);
  };

  return { workspace, themeManifest, routeManifest, contextFor };
}

describe('createPageContext', () => {
  it('构建首页上下文、分页与摘要 URL', () => {
    const { contextFor, workspace } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/');

    expect(context.page.title).toBe('Content Layer Fixture');
    expect(context.page.slug).toBe('index');
    expect(context.pagination?.currentPage).toBe(1);
    expect(context.pagination?.totalPages).toBe(2);
    expect(context.pagination?.pageSize).toBe(1);
    expect(context.pagination?.prevUrl).toBeUndefined();
    expect(context.pagination?.nextUrl).toBe('/page/2/');

    expect(context.collections.posts.map((post) => post.url)).toEqual([
      '/posts/standalone-post/',
      '/posts/folder/',
    ]);
    expect(context.collections.pages.map((page) => page.url)).toEqual([
      '/about/',
    ]);

    expect(
      context.taxonomy.tags.find((tag) => tag.slug === 'alpha')?.url,
    ).toBe('/tag/alpha/');
    expect(
      context.taxonomy.categories.find(
        (category) => category.slug === 'notes',
      )?.url,
    ).toBe('/category/notes/');

    expect(context.content.html).toBe('');
    expect(context.content.assets).toEqual([]);
    expect(context.helpers.t('post.readMore')).toBe('post.readMore');
    expect(context.navigation).toEqual(workspace.site.navigation);
  });

  it('构建第二页分页', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/page/2/');

    expect(context.pagination?.currentPage).toBe(2);
    expect(context.pagination?.prevUrl).toBe('/');
    expect(context.pagination?.nextUrl).toBeUndefined();
  });

  it('构建文章上下文与主题字段', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/posts/standalone-post/');
    const themeFields = context.page.data.theme as Record<
      string,
      Record<string, unknown>
    >;

    expect(context.page.title).toBe('Standalone Post');
    expect(context.page.slug).toBe('standalone-post');
    expect(context.page.kind).toBe('post');
    expect(
      themeFields['wordma-theme-default']?.featured,
    ).toBe(true);
    expect(context.content.html).toBe('');
    expect(context.content.assets).toEqual([]);
  });

  it('构建归档分组', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/archive/');

    expect(context.archive).toHaveLength(1);
    expect(context.archive?.[0]?.year).toBe('2026');
    expect(
      context.archive?.[0]?.posts.map((post) => post.url),
    ).toEqual([
      '/posts/standalone-post/',
      '/posts/folder/',
    ]);
  });

  it('构建分类详情视图', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/category/notes/');

    expect(context.taxonomy.view?.kind).toBe('category');
    if (context.taxonomy.view?.kind !== 'category') {
      throw new Error('预期 category view');
    }
    expect(context.taxonomy.view.term.slug).toBe('notes');
    expect(
      context.taxonomy.view.posts.map((post) => post.url),
    ).toEqual([
      '/posts/standalone-post/',
      '/posts/folder/',
    ]);
  });

  it('分类详情包含页面条目', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/category/pages/');

    expect(context.taxonomy.view?.kind).toBe('category');
    if (context.taxonomy.view?.kind !== 'category') {
      throw new Error('预期 category view');
    }
    expect(
      context.taxonomy.view.posts.map((post) => post.url),
    ).toEqual(['/about/']);
  });

  it('构建标签详情视图', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/tag/alpha/');

    expect(context.taxonomy.view?.kind).toBe('tag');
    if (context.taxonomy.view?.kind !== 'tag') {
      throw new Error('预期 tag view');
    }
    expect(context.taxonomy.view.term.slug).toBe('alpha');
    expect(context.taxonomy.view.posts).toHaveLength(2);
  });

  it('构建 taxonomy 总览视图', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/categories/');

    expect(context.taxonomy.view).toEqual({ kind: 'categories' });
    expect(context.taxonomy.categories.length).toBeGreaterThan(0);
  });

  it('构建主题静态页上下文', () => {
    const { contextFor } = setup(
      'fixtures/custom-pages',
      'fixtures/custom-pages/themes/wordma-theme-custom-pages/theme.yaml',
    );
    const context = contextFor('/search/');

    expect(context.page.title).toBe('search');
    expect(context.page.kind).toBe('page');
    expect(context.content.html).toBe('');
  });

  it('构建 404 上下文', () => {
    const { contextFor } = setup(
      'fixtures/content-layer',
      'themes/default/theme.yaml',
    );
    const context = contextFor('/404/');

    expect(context.page.title).toBe('404');
    expect(context.page.slug).toBe('404');
  });

  it('helpers 拼接 basePath', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/content-layer'),
    );
    const themeManifest = loadTheme('themes/default/theme.yaml');
    const withBasePath = {
      ...workspace,
      site: {
        ...workspace.site,
        site: {
          ...workspace.site.site,
          basePath: '/blog',
        },
      },
    };
    const routeManifest = buildRouteManifest(
      withBasePath,
      themeManifest,
    );
    const route = routeManifest.routes.find(
      (item) => item.path === '/',
    );
    if (!route) throw new Error('缺少首页路由');

    const context = createPageContext({
      route,
      workspace: withBasePath,
      routeManifest,
      themeManifest,
    });

    expect(context.helpers.url('/')).toBe('/blog/');
    expect(context.helpers.url('/x/')).toBe('/blog/x/');
    expect(context.helpers.asset('/a.png')).toBe('/blog/a.png');
    expect(context.pagination?.nextUrl).toBe('/blog/page/2/');
    expect(context.collections.posts[0]?.url).toBe(
      '/posts/standalone-post/',
    );
  });
});
