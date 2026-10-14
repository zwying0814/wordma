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

/** 双击选中演示段落里的一个词，触发浮动工具栏 */
async function selectDemoWord() {
  await page.getByText('下划线').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();
}

test('选中文本时浮动工具栏出现', async () => {
  await selectDemoWord();
});

test('浮动工具栏加粗：点击 B 后文本变为 strong', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('FloatBold');
  await page.getByText('FloatBold').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();

  await page
    .getByTestId('floating-toolbar')
    .getByRole('button', { name: 'Bold', exact: true })
    .click();

  await expect(
    page.locator('strong').filter({ hasText: 'FloatBold' })
  ).toBeVisible();
});

test('取消选择后浮动工具栏隐藏', async () => {
  await selectDemoWord();

  // 点击编辑器末尾空块使选区塌陷
  await page.locator('[data-slate-node="element"]').last().click();

  await expect(page.getByTestId('floating-toolbar')).toBeHidden();
});
