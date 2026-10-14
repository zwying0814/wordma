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

test('Undo/Redo：撤销恢复输入', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('Undo Target');
  await expect(page.getByText('Undo Target')).toBeVisible();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Undo' })
    .click();

  await expect(page.getByText('Undo Target')).toBeHidden();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Redo' })
    .click();

  await expect(page.getByText('Undo Target')).toBeVisible();
});

test('Turn into：段落转 H2', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('TurnInto Target');
  await page.getByText('TurnInto Target').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Turn into' })
    .click();

  await page.getByRole('menuitemradio', { name: 'Heading 2' }).click();

  await expect(
    page.locator('h2').filter({ hasText: 'TurnInto Target' })
  ).toBeVisible();
});

test('Insert 菜单：插入分割线', async () => {
  await page.locator('[data-slate-node="element"]').last().click();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Insert', exact: true })
    .click();

  await page.getByRole('menuitem', { name: 'Divider' }).click();

  await expect(page.locator('[data-slate-editor] hr')).toBeVisible();
});

test('More 菜单：上标/下标', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('Formula');
  await page.getByText('Formula').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'More' })
    .click();

  await page.getByRole('menuitem', { name: 'Superscript' }).click();

  // sup 标记出现（sup/sup 全局唯一）
  await expect(page.locator('[data-slate-editor] sup')).toBeVisible();
});

test('固定工具栏与浮动工具栏共存', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('CoexistText');
  await page.getByText('CoexistText').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();

  // 浮动工具栏存在时，浮动工具栏加粗也可用（作用于同一选区）
  await page
    .getByTestId('floating-toolbar')
    .getByRole('button', { name: 'Bold', exact: true })
    .click();

  await expect(
    page.locator('strong').filter({ hasText: 'CoexistText' })
  ).toBeVisible();
});
