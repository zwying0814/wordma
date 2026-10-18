import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;

  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByTestId('deploy-section')).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

const tempFolder = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-publish-'));

test('T23: 本地文件夹发布产物齐全且不含草稿', async () => {
  // 种子文章默认是草稿：先发布它，另造一篇草稿用于断言「草稿不发布」
  await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    const articles = await api.invoke('list_articles', { siteId: active.id });
    await api.invoke('update_article', {
      id: articles[0].id,
      status: 'published',
    });
    await api.invoke('create_article', {
      siteId: active.id,
      title: '草稿文章',
      slug: 'draft-only',
      content: '<p>draft</p>',
      status: 'draft',
    });
  });

  const folder = tempFolder();
  await page.getByTestId('deploy-folder').fill(folder);
  await page.getByTestId('deploy-run').click();
  await expect(page.getByTestId('deploy-result')).toContainText('已发布');

  // 全套产物
  expect(fs.existsSync(path.join(folder, 'index.html'))).toBe(true);
  expect(fs.existsSync(path.join(folder, 'archive', 'index.html'))).toBe(true);
  expect(fs.existsSync(path.join(folder, 'feed.xml'))).toBe(true);
  const posts = fs.readdirSync(path.join(folder, 'post'));
  expect(posts.some((file) => file.endsWith('.html'))).toBe(true);

  // 草稿不在其中（与预览的关键差异）
  expect(posts).not.toContain('draft-only.html');

  fs.rmSync(folder, { recursive: true, force: true });
});

test('T23: 站点地址作为渲染 baseUrl', async () => {
  const folder = tempFolder();
  await page.getByTestId('deploy-site-url').fill('https://blog.example.com');
  await page.getByTestId('deploy-folder').fill(folder);
  await page.getByTestId('deploy-run').click();
  await expect(page.getByTestId('deploy-result')).toContainText('已发布');

  const indexHtml = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
  expect(indexHtml).toContain('https://blog.example.com/assets/style.css');

  fs.rmSync(folder, { recursive: true, force: true });
});

test('T23: 未配置目标文件夹时发布报错', async () => {
  await page.getByTestId('deploy-folder').fill('');
  await page.getByTestId('deploy-run').click();

  await expect(page.getByTestId('deploy-result')).toContainText('目标文件夹');
});

test('T23: 站点地址非法时报错', async () => {
  await page.getByTestId('deploy-site-url').fill('blog.example.com');
  await page.getByTestId('deploy-folder').fill(tempFolder());
  await page.getByTestId('deploy-run').click();

  await expect(page.getByTestId('deploy-result')).toContainText('http');
});

test('T23: 目标文件夹非空且非发布目录时拒绝', async () => {
  const folder = tempFolder();
  fs.writeFileSync(path.join(folder, '我的文件.txt'), 'do not delete me');

  await page.getByTestId('deploy-folder').fill(folder);
  await page.getByTestId('deploy-run').click();
  await expect(page.getByTestId('deploy-result')).toContainText('不是空的');

  // 用户的文件没被删
  expect(fs.existsSync(path.join(folder, '我的文件.txt'))).toBe(true);

  fs.rmSync(folder, { recursive: true, force: true });
});
