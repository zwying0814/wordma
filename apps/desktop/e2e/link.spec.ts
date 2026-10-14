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

const LINK_URL = 'https://platejs.org';

/** 在末尾空段输入单词、双击选中，并点击浮动工具栏的 Link 按钮 */
async function selectWordAndClickLink(text: string) {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type(text);
  await page.getByText(text).dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();

  await page
    .getByTestId('floating-toolbar')
    .getByRole('button', { name: 'Link', exact: true })
    .click();

  const urlInput = page.getByRole('textbox', { name: 'Paste link' });
  await expect(urlInput).toBeVisible();
  await urlInput.click();
}

test('选中文本点击 Link 插入链接', async ({ }, testInfo) => {
  await selectWordAndClickLink('VisitPlate');

  await page.keyboard.type('https://platejs.org/');
  await page.keyboard.press('Enter');

  const link = page.locator('a[href]').filter({ hasText: 'VisitPlate' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://platejs.org/');
});

test('点击已有链接出现编辑条，可 Unlink', async () => {
  await selectWordAndClickLink('VisitPlate');

  await page.keyboard.type('https://platejs.org/');
  await page.keyboard.press('Enter');
  const link = page.locator('a[href]').filter({ hasText: 'VisitPlate' });
  await expect(link).toBeVisible();

  // 点击链接 → 编辑条（Edit link / 打开 / Unlink）
  await link.click();
  const editBar = page.getByRole('button', { name: 'Edit link' });
  await expect(editBar).toBeVisible();

  await page.getByRole('button', { name: 'Unlink' }).click();
  await expect(link).toBeHidden();
  await expect(page.getByText('VisitPlate')).toBeVisible();
});

test('输入 URL + 空格自动变链接（autolink）', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('See https://example.com docs');

  await expect(page.locator('a[href^="https://example.com"]')).toBeVisible();
  await expect(
    page.locator('a[href]').filter({ hasText: 'https://example.com' })
  ).toBeVisible();
});

test('输入 markdown 链接语法 + 空格转换为链接', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('[md link](https://markdown.example)');
  await page.keyboard.type(' ');

  await expect(
    page.locator('a[href^="https://markdown.example"]').filter({ hasText: 'md link' })
  ).toBeVisible();
});
