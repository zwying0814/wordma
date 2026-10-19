import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

/**
 * 浮层提示（design .toast）：操作成功/失败后在底部弹一条深色小条，
 * 2 秒后淡出、2.3 秒移除；指针事件穿透，不挡后续操作。
 */

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
});

test.afterEach(async () => {
  if (app) await app.close();
});

const toasts = () => page.getByTestId('toast');

test('新建标签 → 成功提示，随后自动消失', async () => {
  await page.evaluate(() => {
    window.location.hash = '#/tags';
  });
  await expect(page.getByTestId('tags-page')).toBeVisible();

  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill('提示标签');
  await page.getByTestId('tag-create').click();

  await expect(toasts()).toHaveText(['标签「提示标签」已创建']);
  await expect(toasts()).toHaveAttribute('data-kind', 'success');

  // 2.3 秒后移除
  await expect(toasts()).toHaveCount(0, { timeout: 5_000 });
});

test('删除文章 → 成功提示；操作不被提示挡住', async () => {
  await page.evaluate(() => {
    window.location.hash = '#/articles';
  });
  await expect(page.getByTestId('articles-page')).toBeVisible();

  await page.getByRole('button', { name: /^删除 / }).first().click();
  await page.getByTestId('confirm-delete-article').click();

  await expect(toasts()).toHaveText([/已删除/]);
  // 提示不拦截点击：紧接着仍可点工具栏
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();
});

test('失败操作 → 错误提示（error 样式）', async () => {
  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByTestId('settings-page')).toBeVisible();

  // 站点名清空后保存 → 主进程校验拒绝
  await page.getByTestId('settings-name').fill('');
  await page.getByTestId('settings-save-site').click();

  await expect(toasts()).toHaveText([/站点名称不能为空/]);
  await expect(toasts()).toHaveAttribute('data-kind', 'error');
  // 行内错误仍在（提示只是补充）
  await expect(page.getByTestId('settings-site-error')).toContainText('站点名称不能为空');
});
