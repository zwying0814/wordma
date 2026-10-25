import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  loadWorkspace,
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';

import {
  ThemeError,
  buildRouteManifest,
  createPageContext,
  loadThemeRuntime,
  renderRoute,
} from '../index';
import type { ThemeRuntime } from '../index';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const snapshotsDir = path.join(import.meta.dirname, '__snapshots__');
const updateSnapshots = process.env.UPDATE_SNAPSHOTS === '1';

function expectGolden(name: string, html: string): void {
  const file = path.join(snapshotsDir, name);

  if (updateSnapshots) {
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(file, html);
    return;
  }

  if (!existsSync(file)) {
    throw new Error(`缺少快照：${file}（运行 UPDATE_SNAPSHOTS=1 更新）`);
  }

  const golden = readFileSync(file, 'utf8');
  expect(html.replace(/\r\n/g, '\n')).toBe(
    golden.replace(/\r\n/g, '\n'),
  );
}

const workspace = loadWorkspace(
  path.join(repoRoot, 'fixtures/content-layer'),
);
const themeManifest = parseThemeManifest(
  parseYamlFile(path.join(repoRoot, 'themes/default/theme.yaml')),
);
const routeManifest = buildRouteManifest(workspace, themeManifest);

let runtimePromise: Promise<ThemeRuntime> | undefined;

function getRuntime(): Promise<ThemeRuntime> {
  runtimePromise ??= loadThemeRuntime(
    path.join(repoRoot, 'fixtures/content-layer'),
    'wordma-theme-default',
  );
  return runtimePromise;
}

async function render(routePath: string): Promise<string> {
  const route = routeManifest.routes.find(
    (item) => item.path === routePath,
  );
  if (!route) throw new Error(`路由不存在：${routePath}`);

  const context = createPageContext({
    route,
    workspace,
    routeManifest,
    themeManifest,
  });

  return renderRoute({
    route,
    context,
    themeRuntime: await getRuntime(),
  });
}

describe('renderRoute', () => {
  it('渲染首页与分页', async () => {
    const html = await render('/');

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('Content Layer Fixture');
    expect(html).toContain('href="/posts/standalone-post/"');
    expect(html).toContain('href="/page/2/"');
    expect(html).toContain('1 / 2');
  });

  it('渲染第二页', async () => {
    const html = await render('/page/2/');

    expect(html).toContain('href="/posts/folder/"');
    expect(html).toContain('href="/"');
    expect(html).toContain('2 / 2');
  });

  it('渲染文章页', async () => {
    const html = await render('/posts/standalone-post/');

    expect(html).toContain('<h1>Standalone Post</h1>');
    expect(html).toContain('2026-03-01');
    expect(html).toContain('class="prose"');
  });

  it('渲染归档页', async () => {
    const html = await render('/archive/');

    expect(html).toContain('归档');
    expect(html).toContain('2026');
    expect(html).toContain('Standalone Post');
    expect(html).toContain('Folder Post');
  });

  it('渲染分类总览', async () => {
    const html = await render('/categories/');

    expect(html).toContain('分类');
    expect(html).toContain('notes');
    expect(html).toContain('href="/category/notes/"');
  });

  it('渲染标签详情', async () => {
    const html = await render('/tag/alpha/');

    expect(html).toContain('alpha');
    expect(html).toContain('Standalone Post');
    expect(html).toContain('Folder Post');
  });

  it('渲染 404', async () => {
    const html = await render('/404/');

    expect(html).toContain('<h1>404</h1>');
    expect(html).toContain('页面不存在');
  });

  it('首页 golden HTML', async () => {
    expectGolden('home.html', await render('/'));
  });

  it('文章页 golden HTML', async () => {
    expectGolden(
      'post.html',
      await render('/posts/standalone-post/'),
    );
  });

  it('404 golden HTML', async () => {
    expectGolden('404.html', await render('/404/'));
  });

  it('注入页面资产与 importmap', async () => {
    const route = routeManifest.routes.find(
      (item) => item.path === '/posts/standalone-post/',
    );
    if (!route) throw new Error('缺少文章路由');

    const context = createPageContext({
      route,
      workspace,
      routeManifest,
      themeManifest,
    });
    const html = renderRoute({
      route,
      context,
      themeRuntime: await getRuntime(),
      assets: {
        styles: ['/assets/islands/island-a.css'],
        importMap: {
          react: '/assets/islands/react-a.js',
        },
        bodyScripts: ['/assets/islands/mount-a.js'],
      },
    });

    expect(html).toContain(
      'href="/assets/islands/island-a.css"',
    );
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain(
      '<script type="module" src="/assets/islands/mount-a.js"></script>',
    );
    expect(html.indexOf('type="importmap"')).toBeLessThan(
      html.indexOf('type="module"'),
    );
    expect(html).toContain('</body>');
  });

  it('缺少布局时抛 MISSING_LAYOUT', async () => {
    const route = routeManifest.routes.find(
      (item) => item.path === '/posts/standalone-post/',
    );
    if (!route) throw new Error('缺少文章路由');

    const context = createPageContext({
      route,
      workspace,
      routeManifest,
      themeManifest,
    });
    const runtime = await getRuntime();
    const { post: _post, ...layouts } = runtime.definition.layouts;
    const brokenRuntime: ThemeRuntime = {
      ...runtime,
      definition: {
        ...runtime.definition,
        layouts,
      },
    };

    expect(() =>
      renderRoute({
        route,
        context,
        themeRuntime: brokenRuntime,
      }),
    ).toThrow(ThemeError);
  });
});
