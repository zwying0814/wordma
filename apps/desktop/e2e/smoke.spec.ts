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

/** 点击编辑器末尾的空段落，获得确定的光标位置 */
async function focusLastBlock() {
  await page.locator('[data-slate-node="element"]').last().click();
}

/** 输入单个单词并双击选中（平台无关的选区方式），等待 Slate 选区同步 */
async function typeAndSelectWord(text: string) {
  await focusLastBlock();
  await page.keyboard.type(text);
  await page.getByText(text).dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();
}

/** 通过 Insert 菜单插入代码块 */
async function insertCodeBlockViaMenu() {
  await focusLastBlock();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Insert', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Code' }).click();
}

test('编辑器渲染：标题与引用块可见', async () => {
  const editable = page.locator('[data-slate-editor="true"]').first();
  await expect(editable).toBeVisible();
  await expect(page.getByText('用 Plate 写博客')).toBeVisible();
  await expect(page.getByText('这是一段引用。')).toBeVisible();
});

test('键盘输入英文文本', async () => {
  await focusLastBlock();
  await page.keyboard.type('Hello World');
  await expect(page.getByText('Hello World')).toBeVisible();
});

test('键盘输入中文文本（模拟输入法提交）', async () => {
  await focusLastBlock();
  await page.keyboard.insertText('你好，博客');
  await expect(page.getByText('你好，博客')).toBeVisible();
});

test('加粗按钮：选中文字后加粗', async () => {
  await typeAndSelectWord('BoldMe');

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Bold', exact: true })
    .click();

  await expect(
    page.locator('strong').filter({ hasText: 'BoldMe' })
  ).toBeVisible();
});

test('Turn into：段落转标题', async () => {
  await typeAndSelectWord('HeadingTarget');

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Turn into' })
    .click();

  await page.getByRole('menuitemradio', { name: 'Heading 1' }).click();

  await expect(
    page.locator('h1').filter({ hasText: 'HeadingTarget' })
  ).toBeVisible();
});

test('Enter 换行产生新块，Backspace 删除', async () => {
  await focusLastBlock();
  await page.keyboard.type('First Line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second Line');
  await expect(page.getByText('First Line')).toBeVisible();
  await expect(page.getByText('Second Line')).toBeVisible();

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.getByText('Second Line')).toBeHidden();
});
