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

test('行首输入 "- " 创建无序列表', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('- list item');

  // 模板实现：无序列表不渲染 ul 包裹，而是 listitem 角色 + list-style 样式
  await expect(
    page
      .locator('[data-slate-editor] [role="listitem"]')
      .filter({ hasText: 'list item' })
  ).toBeVisible();
});

test('行首输入 "1. " 创建有序列表', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('1. ordered item');

  await expect(page.locator('[data-slate-editor] ol')).toBeVisible();
  await expect(
    page.locator('[data-slate-editor] li').filter({ hasText: 'ordered item' })
  ).toBeVisible();
});

test('行首输入 "[] " 创建任务列表并可勾选', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('[] todo item');

  await expect(page.locator('[data-slate-editor] li')).toBeVisible();

  const checkbox = page.locator(
    '[data-slate-editor] [data-slot="checkbox"]'
  );
  await expect(checkbox).toBeVisible();

  await checkbox.click();
  await expect(checkbox).toHaveAttribute('data-checked', /.*/);
});

test('列表项 Tab 缩进与 Shift+Tab 反缩进', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('- outer');
  await page.keyboard.press('Enter');
  // 等 Slate 处理完 Enter（新列表项出现）再 Tab，避免作用于旧选区
  await expect(
    page.locator('[data-slate-editor] [role="listitem"]')
  ).toHaveCount(2);
  await page.keyboard.press('Tab');
  await page.keyboard.type('inner');

  const indented = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll('[data-slate-editor] [data-slate-node="element"]'),
    ];
    // IndentPlugin 注入的样式键是 marginLeft（indent * 24px）
    return els.some(
      (el) => (el as HTMLElement).style.marginLeft === '24px'
    );
  });
  expect(indented).toBeTruthy();

  // 顶级列表项本身 indent=1（marginLeft 24px，设计行为）；
  // Shift+Tab 后应退回顶级：不再存在 48px 的二级缩进
  await page.keyboard.press('Shift+Tab');
  const stillDeep = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll('[data-slate-editor] [data-slate-node="element"]'),
    ];
    return els.some(
      (el) => (el as HTMLElement).style.marginLeft === '48px'
    );
  });
  expect(stillDeep).toBeFalsy();
});

test('工具栏按钮切换列表', async () => {
  await page.locator('[data-slate-node="element"]').last().click();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Numbered list' })
    .click();

  await expect(page.locator('[data-slate-editor] ol')).toBeVisible();

  // 再次点击取消列表
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Numbered list' })
    .click();
  await expect(page.locator('[data-slate-editor] ol')).toBeHidden();
});

test('工具栏 Todo 按钮创建任务列表', async () => {
  await page.locator('[data-slate-node="element"]').last().click();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Todo list' })
    .click();

  await expect(
    page.locator('[data-slate-editor] [data-slot="checkbox"]')
  ).toBeVisible();
});
