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

test('输入三个反引号 + 回车创建代码块', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('```');
  await page.keyboard.press('Enter');

  await expect(
    page.locator('[data-slate-editor] pre')
  ).toBeVisible();
});

test('Insert 菜单插入代码块并可输入', async () => {
  await page.locator('[data-slate-node="element"]').last().click();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Insert', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Code' }).click();

  await expect(page.locator('[data-slate-editor] pre')).toBeVisible();
  await waitForEditorFocus(page);
  await page.keyboard.type('const answer = 42');
  await expect(
    page.locator('[data-slate-editor] pre').filter({ hasText: 'const answer = 42' })
  ).toBeVisible();
});

test('语言选择器：搜索并切换语言', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Insert', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Code' }).click();
  // 等插入变换落地再输入，避免文字进入其他块
  await expect(page.locator('[data-slate-editor] pre')).toBeVisible();
  await waitForEditorFocus(page);
  await page.keyboard.type('const answer = 42');

  // 打开语言选择器（限定 popover 触发器，避免与列表里的同名 'Plain Text' 项撞 strict mode）
  await page
    .locator('[data-slot="popover-trigger"]')
    .filter({ hasText: 'Plain Text' })
    .click();
  const search = page.getByPlaceholder('Search language...');
  await expect(search).toBeVisible();

  await search.fill('type');
  await page.getByRole('button', { name: 'TypeScript', exact: true }).click();

  // 触发按钮显示新语言
  await expect(
    page
      .locator('[data-slot="popover-trigger"]')
      .filter({ hasText: 'TypeScript' })
  ).toBeVisible();
  // 代码仍在（切换语言不丢内容）
  await expect(
    page.locator('[data-slate-editor] pre').filter({ hasText: 'const answer = 42' })
  ).toBeVisible();
});

test('复制按钮存在且代码块内容可被复制', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Insert', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Code' }).click();
  await waitForEditorFocus(page);
  await page.keyboard.type('const answer = 42');

  await expect(
    page.getByRole('button', { name: 'Copy code' })
  ).toBeVisible();
});

test('mod+alt+8 快捷键切换代码块', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('shortcut text');

  // 不按 Shift+Home：macOS 下它有时会选到文档开头，导致整篇一起被转成代码块
  await page.keyboard.press('ControlOrMeta+Alt+8');

  const pres = page.locator('[data-slate-editor] pre');
  await expect(pres).toHaveCount(1);
  await expect(pres).toContainText('shortcut text');
});
