import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.afterEach(async () => {
  if (app) await app.close();
});

const DEMO_CONTENT =
  '<h1>Hello T8</h1><p>world <strong>bold</strong></p><blockquote><p>quote line</p></blockquote>';

test('T8: 加载文章——标题与正文（含加粗/引用）还原', async () => {
  const launched = await launchDesktop({ articleContent: DEMO_CONTENT });
  app = launched.app;
  page = launched.page;

  await expect(page.getByTestId('article-title')).toHaveValue('演示文章');
  await expect(
    page.locator('[data-slate-editor] h1').filter({ hasText: 'Hello T8' })
  ).toBeVisible();
  await expect(
    page.locator('[data-slate-editor] strong').filter({ hasText: 'bold' })
  ).toBeVisible();
  await expect(
    page.locator('[data-slate-editor] blockquote').filter({ hasText: 'quote line' })
  ).toBeVisible();
});

test('T8: 编辑 + 保存 → 重启后还原（标题/正文持久化）', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-e2e-'));
  const first = await launchDesktop({ dataDir, articleContent: '<p>seed</p>' });
  app = first.app;
  page = first.page;

  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('New Sentence');
  await page.getByTestId('article-title').fill('T8 保存');
  await page.getByTestId('article-save').click();
  await expect(page.getByTestId('saved-at')).toBeVisible();
  await app.close();

  const second = await launchDesktop({ dataDir, articleContent: '<p>seed</p>' });
  app = second.app;
  page = second.page;

  await expect(page.getByTestId('article-title')).toHaveValue('T8 保存');
  await expect(
    page.locator('[data-slate-editor]').filter({ hasText: 'New Sentence' })
  ).toBeVisible();
});

test('T8: slug 清空后保存 → 自动生成 8 位 slug', async () => {
  const launched = await launchDesktop({ articleContent: '<p>seed</p>' });
  app = launched.app;
  page = launched.page;

  await page.getByTestId('article-slug').fill('');
  await page.getByTestId('article-save').click();

  await expect(page.getByTestId('article-slug')).toHaveValue(/^[a-z]{8}$/);
  await expect(page.getByTestId('save-error')).toBeHidden();
});

test('T8: 非法 slug 保存 → 行内中文错误', async () => {
  const launched = await launchDesktop({ articleContent: '<p>seed</p>' });
  app = launched.app;
  page = launched.page;

  await page.getByTestId('article-slug').fill('Bad Slug');
  await page.getByTestId('article-save').click();

  await expect(page.getByTestId('save-error')).toBeVisible();
  await expect(page.getByTestId('save-error')).toContainText('slug');
});

test('T8: 状态切换 draft→published → 列表徽标更新', async () => {
  const launched = await launchDesktop({ articleContent: '<p>seed</p>' });
  app = launched.app;
  page = launched.page;

  await expect(page.getByTestId('article-status')).toContainText('草稿');
  await page.getByTestId('article-status').click();
  await expect(page.getByTestId('article-status')).toContainText('已发布');

  await page.getByTestId('editor-back').click();

  await expect(
    page
      .getByTestId('articles-page')
      .getByRole('button', { name: /演示文章/ })
      .first()
  ).toBeVisible();
  // 列表改行列表后不再有 table cell：断言行内状态胶囊
  await expect(
    page.getByTestId('articles-page').getByText('已发布').first()
  ).toBeVisible();
});

test('T8: 分类/标签选择 → 保存 → 重进选中态还原', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-e2e-'));
  const first = await launchDesktop({
    dataDir,
    articleContent: '<p>seed</p>',
  });
  app = first.app;
  page = first.page;

  // 先通过 IPC 建分类/标签，再刷新页面使候选列表加载
  await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    await api.invoke('create_category', {
      siteId: active.id,
      name: '测试分类',
    });
    await api.invoke('create_tag', { siteId: active.id, name: '测试标签' });
  });
  await page.reload();
  await expect(page.getByTestId('article-title')).toHaveValue('演示文章');

  // 先标签后分类：菜单向下弹出会盖住相邻按钮，最后一步不再点相邻按钮
  await page.getByTestId('tag-selector').click();
  await page.getByRole('menuitemcheckbox', { name: '测试标签' }).click();
  await page.getByTestId('tag-selector').click(); // 收起

  await page.getByTestId('category-selector').click();
  await page.getByRole('menuitemcheckbox', { name: '测试分类' }).click();
  await page.getByTestId('category-selector').click(); // 收起

  await page.getByTestId('article-save').click();
  await expect(page.getByTestId('saved-at')).toBeVisible();
  await app.close();

  // 重进页面（同一数据目录）→ 选中态还原
  const second = await launchDesktop({ dataDir, articleContent: '<p>seed</p>' });
  app = second.app;
  page = second.page;

  await page.getByTestId('category-selector').click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: '测试分类' })
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('category-selector').click(); // 收起

  await page.getByTestId('tag-selector').click();
  await expect(
    page.getByRole('menuitemcheckbox', { name: '测试标签' })
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tag-selector').click(); // 收起
});
