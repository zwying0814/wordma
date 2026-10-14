import { expect, test } from '@playwright/test';
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
    window.location.hash = '#/pages';
  });
  await expect(page.getByTestId('pages-page')).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('T13: 新建页面 → 保存标题 → 列表出现 → 编辑器加载', async () => {
  await page.getByTestId('create-page').click();
  await expect(page.getByTestId('page-title')).toHaveValue('未命名页面');

  await page.getByTestId('page-title').fill('关于我');
  await page.getByTestId('page-save').click();
  await expect(page.getByTestId('page-saved-at')).toBeVisible();

  await page.getByTestId('page-editor-back').click();
  await expect(page.getByTestId('pages-page').getByText('关于我')).toBeVisible();

  // 点进编辑器确认标题还原
  await page.getByTestId('pages-page').getByText('关于我').click();
  await expect(page.getByTestId('page-title')).toHaveValue('关于我');
});

test('T13: 编辑内容 + 保存 → 重启还原', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-e2e-'));
  await app.close();

  const first = await launchDesktop({ dataDir, seed: true });
  app = first.app;
  page = first.page;
  await page.evaluate(() => {
    window.location.hash = '#/pages';
  });
  await expect(page.getByTestId('pages-page')).toBeVisible();
  await page.getByTestId('create-page').click();

  await page.getByTestId('page-title').fill('关于本站');
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('Page Body Text');
  await page.getByTestId('page-save').click();
  await expect(page.getByTestId('page-saved-at')).toBeVisible();
  await app.close();
  // 等待前一个 Electron 进程完全退出，避免 SQLite 文件句柄竞态
  await page.waitForTimeout(500);

  const second = await launchDesktop({ dataDir, seed: true });
  app = second.app;
  page = second.page;
  await page.evaluate(() => {
    window.location.hash = '#/pages';
  });
  await expect(page.getByTestId('pages-page')).toBeVisible();

  // 标题还原；点进编辑器确认正文还原
  await expect(page.getByTestId('pages-page').getByText('关于本站')).toBeVisible();
  await page.getByTestId('pages-page').getByText('关于本站').click();
  await expect(
    page.locator('[data-slate-editor]').filter({ hasText: 'Page Body Text' })
  ).toBeVisible();
});

test('T13: slug 冲突 → 行内错误', async () => {
  // 建两个页面，把第二个的 slug 改成与第一个相同
  await page.getByTestId('create-page').click();
  await expect(page.getByTestId('page-title')).toBeVisible();
  const slug1 = await page.getByTestId('page-slug').inputValue();

  await page.getByTestId('page-editor-back').click();
  await page.getByTestId('create-page').click();
  await expect(page.getByTestId('page-title')).toHaveValue('未命名页面');

  await page.getByTestId('page-slug').fill(slug1);
  await page.getByTestId('page-save').click();

  await expect(page.getByTestId('page-save-error')).toContainText(
    '已被本站点其他页面使用'
  );
});

test('T13: 加入导航开关持久化', async () => {
  await page.getByTestId('create-page').click();
  await expect(page.getByTestId('page-title')).toBeVisible();

  // 默认开 → 关（Base UI Switch 用 aria-checked 表达状态）
  await page.getByTestId('page-show-in-nav').click();
  await expect(page.getByTestId('page-show-in-nav')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await page.getByTestId('page-save').click();
  await expect(page.getByTestId('page-saved-at')).toBeVisible();

  await page.getByTestId('page-editor-back').click();
  // 列表中该页不再带“导航”徽标（页面上唯一的页面行）
  await expect(page.getByTestId('pages-page').getByText('导航')).toBeHidden();

  // 重进编辑器 → 开关仍为关
  await page.getByTestId('pages-page').getByText('未命名页面').click();
  await expect(page.getByTestId('page-show-in-nav')).toHaveAttribute(
    'aria-checked',
    'false'
  );
});
