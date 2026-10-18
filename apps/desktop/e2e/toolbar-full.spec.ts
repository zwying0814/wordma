import { expect, test } from './fixtures';
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

test('固定工具栏：窗口变窄收纳分组时不重建按钮节点', async () => {
  // 给工具栏里的 Table 按钮打标记（记录 DOM 节点身份）
  const marked = await page.evaluate(() => {
    const btn = document.querySelector(
      '[data-testid="fixed-toolbar"] [aria-label="Table"]'
    ) as (HTMLElement & { __wordmaMark?: string }) | null;
    if (!btn) return false;
    btn.__wordmaMark = 'keep';
    return true;
  });
  expect(marked).toBe(true);

  // 缩窄窗口 → 触发收纳（部分分组进 More 菜单）
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const [w, h] = win.getSize();
    win.setSize(Math.max(640, Math.round(w * 0.6)), h);
  });
  await page.waitForTimeout(400);

  // 节点仍是同一个（没被卸载重建）
  const stillSame = await page.evaluate(() => {
    const btn = document.querySelector(
      '[data-testid="fixed-toolbar"] [aria-label="Table"]'
    ) as (HTMLElement & { __wordmaMark?: string }) | null;
    return btn?.__wordmaMark === 'keep';
  });
  expect(stillSame).toBe(true);

  // 确实发生了收纳：More 菜单里能找到 Table
  await page.getByTestId('fixed-toolbar').getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menu').getByRole('button', { name: 'Table' })).toBeVisible();
  await page.keyboard.press('Escape');
});
