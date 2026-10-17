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

async function selectDemoWord() {
  await page.getByText('下划线').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();
}

test('对齐按钮：段落居中', async () => {
  await selectDemoWord();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Align' })
    .click();

  await page
    .getByRole('menuitemradio', { name: 'Align center' })
    .click();

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const els = [
          ...document.querySelectorAll(
            '[data-slate-editor] [data-slate-node="element"]'
          ),
        ];
        return els.some(
          (el) => (el as HTMLElement).style.textAlign === 'center'
        );
      });
    })
    .toBeTruthy();
});

test('字色：选中文本应用红色', async () => {
  await selectDemoWord();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Text Color' })
    .click();

  // 色板网格中的红色色块（#FE0000 → 浏览器序列化为 rgb()）
  const swatch = page.locator('[style*="rgb(254, 0, 0)"]').first();
  await expect(swatch).toBeVisible();
  await swatch.click();

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const spans = [
          ...document.querySelectorAll('[data-slate-editor] span[data-slate-leaf]'),
        ];
        return spans.some(
          (el) => (el as HTMLElement).style.color === 'rgb(254, 0, 0)'
        );
      });
    })
    .toBeTruthy();
});

test('背景色：选中文本应用黄色背景', async () => {
  await selectDemoWord();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Background Color' })
    .click();

  const swatch = page.locator('[style*="rgb(254, 255, 0)"]').first();
  await expect(swatch).toBeVisible();
  await swatch.click();

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const spans = [
          ...document.querySelectorAll('[data-slate-editor] span[data-slate-leaf]'),
        ];
        return spans.some(
          (el) =>
            (el as HTMLElement).style.backgroundColor === 'rgb(254, 255, 0)'
        );
      });
    })
    .toBeTruthy();
});
