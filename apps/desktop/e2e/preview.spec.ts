import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

let seededArticleId: number;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
  seededArticleId = launched.seeded?.articleId ?? 0;

  // 造一篇已发布文章
  await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    await api.invoke('create_article', {
      siteId: active.id,
      title: '预览文章',
      slug: 'preview-post',
      content: '<p>预览正文内容</p>',
      status: 'published',
    });
  });
});

test.afterEach(async () => {
  if (app) await app.close();
});

const getPort = (): Promise<number> =>
  page.evaluate(() => (window as any).api.invoke('get_preview_port'));

const renderSite = (): Promise<unknown> =>
  page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  });

test('T16: render_site + 预览服务器（首页/文章页 200）', async () => {
  await renderSite();
  const port = await getPort();

  const index = await fetch(`http://127.0.0.1:${port}/`);
  expect(index.status).toBe(200);
  expect(await index.text()).toContain('测试站点');

  const post = await fetch(`http://127.0.0.1:${port}/post/preview-post.html`);
  expect(post.status).toBe(200);
  expect(await post.text()).toContain('预览正文内容');
});

test('T16: 路径穿越被拒', async () => {
  await renderSite();
  const port = await getPort();

  const res = await fetch(
    `http://127.0.0.1:${port}/%2e%2e/%2e%2e/etc/passwd`
  );
  expect([403, 404]).toContain(res.status);
});

test('T16: 修改预览端口 → 新端口生效', async () => {
  await renderSite();
  await page.evaluate(() =>
    (window as any).api.invoke('set_preview_port', { port: 12800 })
  );
  await renderSite();

  const index = await fetch('http://127.0.0.1:12800/');
  expect(index.status).toBe(200);
  expect(await index.text()).toContain('测试站点');

  // 改回默认端口
  await page.evaluate(() =>
    (window as any).api.invoke('set_preview_port', { port: 12739 })
  );
});

test('T16: 端口非法被拒（低于 1024）', async () => {
  await expect(
    page.evaluate(() =>
      (window as any).api.invoke('set_preview_port', { port: 80 })
    )
  ).rejects.toThrow(/1024/);
});

test('T16: 设置页改站点名 → 重新渲染后首页更新', async () => {
  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByTestId('settings-page')).toBeVisible();

  await page.getByTestId('settings-name').fill('改名站点');
  await page.getByTestId('settings-save-site').click();
  await expect(page.getByTestId('settings-site-error')).toBeHidden();

  await renderSite();
  const port = await getPort();

  const index = await fetch(`http://127.0.0.1:${port}/`);
  expect(await index.text()).toContain('改名站点');
});

test('T16: 文章页「预览」按钮 = 先保存再渲染并打开', async () => {
  // 进编辑器改标题（未保存）
  await page.evaluate((id: number) => {
    window.location.hash = `#/editor/${id}`;
  }, seededArticleId);
  await expect(page.getByTestId('article-title')).toBeVisible();

  await page.getByTestId('article-title').fill('预览标题已更新');
  // 尚未保存
  await expect(page.getByTestId('saved-at')).toHaveCount(0);

  await page.getByTestId('article-preview').click();

  // 保存被触发
  await expect(page.getByTestId('saved-at')).toBeVisible();

  // 预览服务器起来，且渲染的是刚保存的内容
  // 注意：首页/归档只列已发布文章，草稿只生成详情页，所以这里断言详情页
  const slug = await page.getByTestId('article-slug').inputValue();
  const port = await getPort();
  const post = await fetch(`http://127.0.0.1:${port}/post/${slug}.html`);
  expect(post.status).toBe(200);
  expect(await post.text()).toContain('预览标题已更新');
});
