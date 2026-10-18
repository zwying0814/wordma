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

const menu = () => page.getByTestId('slash-menu');
const columns = () => page.locator('[data-slate-editor] .slate-column');
const columnGroups = () => page.locator('[data-slate-editor] .slate-column_group');

/** 通过斜杠菜单插入（keywords 触发过滤后回车） */
async function insertViaSlash(keyword: string) {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('/');
  await expect(menu()).toBeVisible();
  await page.keyboard.type(keyword);
  await page.keyboard.press('Enter');
  await expect(menu()).toBeHidden();
}

/** 列宽读的是外层定位 div（宽度的承载者） */
const columnWidths = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-slate-editor] .slate-column')].map((el) => {
      const outer = el.closest('.group\\/column') as HTMLElement | null;
      return outer?.style.width ?? (el as HTMLElement).style.width;
    })
  );

test('斜杠菜单插入三栏布局', async () => {
  await insertViaSlash('sanlan');

  await expect(columnGroups()).toHaveCount(1);
  await expect(columns()).toHaveCount(3);
  expect(await columnWidths()).toEqual(['33.3333%', '33.3333%', '33.3333%']);
  // 每列里都有一个空段落
  await expect(page.locator('[data-slate-editor] .slate-column .slate-p')).toHaveCount(3);
});

test('列组浮动工具条切换宽度预设', async () => {
  await insertViaSlash('sanlan');
  await expect(columns()).toHaveCount(3);

  await page.locator('[data-slate-editor] .slate-column .slate-p').first().click();
  await expect(page.getByRole('button', { name: '左窄右宽' })).toBeVisible();
  await page.getByRole('button', { name: '左窄右宽' }).click();

  await expect.poll(columnWidths).toEqual(['70%', '30%']);
});

test('拖动列手柄调整列顺序', async () => {
  await insertViaSlash('sanlan');
  await expect(columns()).toHaveCount(3);

  // 用块 id 判断顺序（不依赖往列里打字）
  const columnIds = () =>
    columns().evaluateAll((els) =>
      els.map(
        (el) =>
          el.getAttribute('data-block-id') ??
          el.getAttribute('data-slate-id') ??
          ''
      )
    );
  const before = await columnIds();
  expect(before.filter(Boolean)).toHaveLength(3);

  const handle = page.getByTestId('column-drag-handle').first();
  await handle.hover();
  await handle.dragTo(columns().nth(2), { targetPosition: { x: 20, y: 10 }, steps: 12 });

  await expect.poll(columnIds, { timeout: 10_000 }).not.toEqual(before);
});

test('斜杠菜单插入块级公式并渲染 KaTeX', async () => {
  await insertViaSlash('gongshi');

  await expect(page.locator('[data-slate-editor] .slate-equation')).toHaveCount(1);

  // 弹层里的输入框应自动获得焦点；用 fill 原子写入，避免逐键打字撞上弹层挂载
  const textarea = page.locator('[data-slot="popover-content"] textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('E = mc^2');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-slate-editor] .slate-equation .katex')).toHaveCount(1);
  await expect(
    page.locator('[data-slate-editor] .slate-equation annotation')
  ).toHaveText('E = mc^2');
  // 关闭后整块被选中（onClose 里的 blockSelection.set）
  await expect(page.locator('[data-slot="block-selection"]')).toHaveCount(1);
});

test('浮动工具栏把选中文本标为行内公式', async () => {
  await page.getByText('下划线').dblclick();
  await expect(page.getByTestId('floating-toolbar')).toBeVisible();

  await page.getByRole('button', { name: 'Mark as equation' }).click();
  await expect(page.locator('[data-slate-editor] .slate-inline_equation')).toHaveCount(1);
  // KaTeX 样式生效（字体族来自 katex.css）
  await expect
    .poll(() =>
      page.evaluate(() => {
        const katex = document.querySelector('[data-slate-editor] .katex');
        return katex ? getComputedStyle(katex).fontFamily : '';
      })
    )
    .toContain('KaTeX');
});

test('保存往返：分栏与公式都能还原（base 套件守门用例）', async () => {
  await insertViaSlash('sanlan');
  await expect(columns()).toHaveCount(3);
  await insertViaSlash('gongshi');
  const textarea = page.locator('[data-slot="popover-content"] textarea');
  await expect(textarea).toBeFocused();
  await textarea.fill('a^2 + b^2 = c^2');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-slate-editor] .slate-equation .katex')).toHaveCount(1);

  await page.getByTestId('article-save').click();
  await expect(page.getByTestId('saved-at')).toBeVisible();

  await page.reload();
  await page.waitForSelector('[data-slate-editor="true"]');

  // base 套件缺任一插件，这里就会退化成普通 div / 丢掉公式
  await expect(columnGroups()).toHaveCount(1);
  await expect(columns()).toHaveCount(3);
  expect(await columnWidths()).toEqual(['33.3333%', '33.3333%', '33.3333%']);
  await expect(page.locator('[data-slate-editor] .slate-equation .katex')).toHaveCount(1);
  await expect(
    page.locator('[data-slate-editor] .slate-equation annotation')
  ).toHaveText('a^2 + b^2 = c^2');
});
