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

const handles = () => page.getByTestId('block-drag-handle');

/** 块的可见文本（按文档顺序） */
const blockTexts = () =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-slate-editor] [data-slate-node="element"]'
      ),
    ].map((el) => (el.textContent ?? '').trim().slice(0, 10))
  );

/** 在编辑器左侧留白处按下并斜向拖过若干块，产生块选区 */
async function dragSelectBlocks(fromY: number, toY: number) {
  const box = (await page.locator('[data-slate-editor]').boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + fromY);
  await page.mouse.down();
  // 必须斜向拖动：矩形宽度为 0 时框不到任何块
  await page.mouse.move(box.x + 260, box.y + toY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test('hover 块时显示拖拽手柄', async () => {
  const first = handles().first();
  const opacityOf = (i: number) =>
    handles()
      .nth(i)
      .evaluate((el) => getComputedStyle(el.closest('.slate-gutterLeft')!).opacity);

  await expect(first).toHaveCount(1);
  expect(await opacityOf(1)).toBe('0');

  // 用坐标 hover：比 locator.hover() 更稳，避免落在手柄/工具条上
  const box = (await page.locator('[data-slate-node="element"]').nth(1).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => opacityOf(1), { timeout: 10_000 }).toBe('1');
});

test('点击手柄选中整块', async () => {
  const handle = handles().nth(1);
  await handle.hover();
  await handle.click();
  await page.waitForTimeout(150);

  await expect(page.locator('[data-slot="block-selection"]')).toHaveCount(1);
});

test('左侧留白拖拽框选多个块', async () => {
  await dragSelectBlocks(40, 200);

  // 高亮遮罩数量 = 被框选的块数（至少覆盖标题与正文）
  const count = await page.locator('[data-slot="block-selection"]').count();
  expect(count).toBeGreaterThanOrEqual(2);
});

test('拖拽手柄调整块顺序', async () => {
  const before = await blockTexts();
  expect(before[1]).toContain('支持');

  // 把第 3 块（引用）拖到第 1 块上方
  const handle = handles().nth(2);
  await handle.hover();
  await page.waitForTimeout(150);
  await handle.dragTo(page.locator('[data-slate-node="element"]').nth(0), {
    targetPosition: { x: 30, y: 2 },
    steps: 12,
  });
  await page.waitForTimeout(300);

  // 落点判定由库在 dragover 时计算，等顺序真正变化
  await expect
    .poll(async () => (await blockTexts())[1], { timeout: 10_000 })
    .toContain('这是一段引用');
  const after = await blockTexts();
  expect(after.indexOf('支持 粗体、斜体、下')).toBeGreaterThan(1);
});

test('块选中后工具栏操作仍作用于选区且光标回到编辑器', async () => {
  await dragSelectBlocks(40, 120);
  await expect(page.locator('[data-slot="block-selection"]').first()).toBeVisible();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Align' })
    .click();
  await page.getByRole('menuitemradio', { name: 'Align center' }).click();
  await page.waitForTimeout(300);

  // 对齐作用于被选中的块
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-slate-node="element"]')].some(
            (el) => (el as HTMLElement).style.textAlign === 'center'
          )
        ),
      { timeout: 10_000 }
    )
    .toBe(true);

  // 弹层关闭后焦点回到编辑器（BlockSelectionPlugin 会改写 tf.focus，
  // 这里锁住「菜单操作后光标不丢」这条回归）
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            (document.activeElement as HTMLElement | null)?.getAttribute(
              'data-slate-editor'
            ) === 'true'
        ),
      { timeout: 10_000 }
    )
    .toBe(true);
});

test('表格内部不出现块手柄（仅表格整块有）', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Table', exact: true })
    .click();
  await page
    .getByRole('menu', { name: 'Table' })
    .getByText('Table', { exact: true })
    .hover();
  await page.locator('div.grid > div').nth(2 * 8 + 2).hover();
  await page.getByRole('button', { name: '3 x 3' }).click();
  await expect(page.locator('[data-slate-editor] table')).toBeVisible();

  await page.locator('[data-slate-editor] table td').first().click();
  await page.keyboard.type('cell');
  await page.waitForTimeout(200);

  const inside = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="block-drag-handle"]')].filter(
        (h) => !!h.closest('td, th')
      ).length
  );
  expect(inside).toBe(0);
});
