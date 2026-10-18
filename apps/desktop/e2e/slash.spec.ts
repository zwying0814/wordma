import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop, waitForEditorFocus } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchDesktop());
});

test.afterEach(async () => {
  await app.close();
});

const menu = () => page.getByTestId('slash-menu');
const options = () => page.getByRole('option');

/** 点击末尾空段落并把光标放进去 */
async function focusLastBlock() {
  await page.locator('[data-slate-node="element"]').last().click();
}

test('输入 / 唤出命令面板，过滤后回车插入', async () => {
  await focusLastBlock();
  await page.keyboard.type('/');

  await expect(menu()).toBeVisible();
  // 焦点必须留在内联输入框上，否则没法继续打字
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName))
    .toBe('INPUT');

  await page.keyboard.type('head');
  await expect(options()).toHaveCount(3);
  await expect(page.getByRole('option', { name: '标题 1' })).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(menu()).toBeHidden();
  // 演示文章本身已有一个 h1，这里断言多出一个
  const headings = page.locator('[data-slate-editor] h1');
  await expect(headings).toHaveCount(2);

  // 焦点交回编辑器，且 `/head` 没有残留
  await waitForEditorFocus(page);
  await page.keyboard.type('标题内容');
  await expect(headings.last()).toHaveText('标题内容');
  await expect(page.getByText('/head')).toBeHidden();
});

test('点击列表项插入（引用）', async () => {
  await focusLastBlock();
  await page.keyboard.type('/');
  await expect(menu()).toBeVisible();

  await page.keyboard.type('quote');
  await page.getByRole('option', { name: '引用' }).click();

  await expect(menu()).toBeHidden();
  // 演示文章本身已有一个引用，这里断言多出一个
  await expect(page.locator('[data-slate-editor] blockquote')).toHaveCount(2);
});

test('Escape 关闭面板并把 /xxx 原样写回文档', async () => {
  await focusLastBlock();
  await page.keyboard.type('/quote');
  await expect(menu()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu()).toBeHidden();

  // 取消要把 trigger + 查询串写回，且只写一次（blur 会二次触发取消）
  await expect(page.getByText('/quote')).toBeVisible();
});

test('代码块内输入 / 不唤出面板', async () => {
  await focusLastBlock();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Insert', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Code' }).click();
  await expect(page.locator('[data-slate-editor] pre')).toBeVisible();
  await waitForEditorFocus(page);

  await page.keyboard.type('/');
  await expect(menu()).toHaveCount(0);
  await expect(page.locator('[data-slate-editor] pre')).toContainText('/');
});

test('正文中的 / 不误触发（分数与 URL）', async () => {
  await focusLastBlock();
  await page.keyboard.type('half 1/2');
  await expect(menu()).toHaveCount(0);

  await page.keyboard.press('Enter');
  await page.keyboard.type('see https://example.com/a');
  await expect(menu()).toHaveCount(0);
});

test('方向键在候选项之间移动', async () => {
  await focusLastBlock();
  await page.keyboard.type('/');
  await expect(menu()).toBeVisible();

  const highlighted = () =>
    page.evaluate(
      () =>
        document.querySelector('[role="option"][data-highlighted]')?.textContent?.trim() ??
        null
    );

  // 等首项自动高亮出现再读基准值
  await expect.poll(highlighted).not.toBeNull();
  const first = await highlighted();

  await page.keyboard.press('ArrowDown');
  await expect.poll(highlighted).not.toBe(first);

  // 循环：从首项往上应该跳到末项
  await page.keyboard.press('ArrowUp');
  await expect.poll(highlighted).toBe(first);
});
