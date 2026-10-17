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

/** 通过工具栏按钮 → Table 子菜单 → 网格选择插入 r×c 表格 */
async function insertTable(rows: number, cols: number) {
  await page.locator('[data-slate-node="element"]').last().click();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Table', exact: true })
    .click();

  // 限定在菜单内定位子触发器，避免与按钮 tooltip 文本（也是 "Table"）撞 strict mode
  await page
    .getByRole('menu', { name: 'Table' })
    .getByText('Table', { exact: true })
    .hover();

  // 网格 8x8，hover 到第 rows 行第 cols 列的格子（尺寸文本随之更新为 r x c）
  const cells = page.locator('div.grid > div');
  await cells.nth((rows - 1) * 8 + (cols - 1)).hover();

  await page.getByRole('button', { name: `${rows} x ${cols}` }).click();
}

test('网格选择插入 3x3 表格', async () => {
  await insertTable(3, 3);

  await expect(page.locator('[data-slate-editor] table')).toBeVisible();
  await expect(page.locator('[data-slate-editor] table tr')).toHaveCount(3);
  // insertTable 默认无 header：全部是 td
  await expect(
    page.locator('[data-slate-editor] table td')
  ).toHaveCount(9);
});

test('单元格输入文字', async () => {
  await insertTable(2, 2);

  await page.locator('[data-slate-editor] table td').first().click();
  await page.keyboard.type('Cell Text');

  await expect(
    page.locator('[data-slate-editor] table td').filter({ hasText: 'Cell Text' })
  ).toBeVisible();
});

test('单元格浮动工具栏：下方加行 / 右侧加列 / 删行', async () => {
  await insertTable(2, 2);

  // 点击第一个单元格 → 单格浮动工具栏出现
  await page.locator('[data-slate-editor] table td').first().click();
  const rowAfter = page.getByRole('button', { name: 'Insert row after' });
  await expect(rowAfter).toBeVisible();

  await rowAfter.click();
  await expect(page.locator('[data-slate-editor] table tr')).toHaveCount(3);

  const colAfter = page.getByRole('button', { name: 'Insert column after' });
  await colAfter.click();
  await expect(
    page.locator('[data-slate-editor] table tr').first().locator('th, td')
  ).toHaveCount(3);

  await page.getByRole('button', { name: 'Delete row' }).click();
  await expect(page.locator('[data-slate-editor] table tr')).toHaveCount(2);
});

test('拖拽列宽手柄改变列宽', async () => {
  await insertTable(2, 2);

  const handle = page
    .locator('[data-testid="table-resize-right-0-0"]')
    .first();
  await handle.hover();

  const widthBefore = await page.evaluate(() => {
    // colgroup 第 1 个 col 是 8px 控制列，数据列从第 2 个开始
    const col = document.querySelector(
      '[data-slate-editor] colgroup col:nth-of-type(2)'
    ) as HTMLElement;
    return col?.style.width;
  });

  const box = await handle.boundingBox();
  if (!box) throw new Error('handle not found');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const widthAfter = await page.evaluate(() => {
        const col = document.querySelector(
          '[data-slate-editor] colgroup col:nth-of-type(2)'
        ) as HTMLElement;
        return col?.style.width;
      });
      return widthAfter !== widthBefore && widthAfter !== '120px';
    })
    .toBeTruthy();
});

test('选中表格后可整体删除', async () => {
  await insertTable(2, 2);

  // 点击单元格 → 单格浮动工具栏 → 用其自带的 Delete table 按钮
  await page.locator('[data-slate-editor] table td').first().click();
  const deleteBtn = page.getByRole('button', { name: 'Delete table' });
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  await expect(page.locator('[data-slate-editor] table')).toBeHidden();
});

test('框选单元格有高亮样式', async () => {
  await insertTable(3, 3);

  // 在首格输入后用 Shift+方向键扩选到相邻单元格
  await page.locator('[data-slate-editor] table td').first().click();
  await page.keyboard.type('A1');
  await page.keyboard.press('Shift+ArrowRight');

  // data-table-cell-selected 由表格插件写在 DOM 上，样式来自 TableCellElement
  // 的 before:bg-brand/5 —— 缺了这段 CSS 就会出现「选中了但看不出来」
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const cell = document.querySelector(
          '[data-slate-editor] [data-table-cell-selected="true"]'
        ) as HTMLElement | null;
        if (!cell) return null;
        return getComputedStyle(cell, '::before').backgroundColor;
      })
    )
    .not.toBe('rgba(0, 0, 0, 0)');
});
