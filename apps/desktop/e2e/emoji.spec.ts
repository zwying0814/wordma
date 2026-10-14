import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchDesktop());
});

test.afterEach(async () => {
  await app.close();
});

test('Emoji 选择器打开、搜索并插入', async () => {
  await page.locator('[data-slate-node="element"]').last().click();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Emoji' })
    .click();

  const search = page.getByTestId('emoji-search-input');
  await expect(search).toBeVisible();

  await search.fill('tada');
  await page.getByRole('button', { name: '🎉' }).first().click();

  await expect(page.getByText('🎉')).toBeVisible();
});

test('分类导航可见且可切换', async () => {
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Emoji' })
    .click();

  const search = page.getByTestId('emoji-search-input');
  await expect(search).toBeVisible();

  // 点击 "Nature" 分类（aria-label 为分类名）
  await page.getByRole('button', { name: 'Nature' }).click();
  await expect(search).toBeVisible();
});

test('Escape 关闭选择器且已输入文本保留', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('before emoji');

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Emoji' })
    .click();
  await expect(page.getByTestId('emoji-search-input')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('emoji-search-input')).toBeHidden();
  await expect(page.getByText('before emoji')).toBeVisible();
});
