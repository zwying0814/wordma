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

const IMG_URL =
  'https://images.unsplash.com/photo-1712688930249-98e1963af7bd?q=80&w=600&auto=format&fit=crop';

async function insertImageByUrl(url: string) {
  await page.locator('[data-slate-node="element"]').last().click();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Image', exact: true })
    .click();

  const input = page.getByTestId('image-url-input');
  await expect(input).toBeVisible();
  await input.click();
  await page.keyboard.type(url);
  await page.keyboard.press('Enter');
}

test('通过 URL 插入图片', async () => {
  await insertImageByUrl(IMG_URL);

  await expect(page.locator('[data-slate-editor] img')).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.locator('[data-slate-editor] img').getAttribute('src')) ??
        ''
    )
    .toContain('unsplash');
});

test('非法 URL 时 Insert 按钮禁用', async () => {
  await page.locator('[data-slate-node="element"]').last().click();
  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Image', exact: true })
    .click();

  const input = page.getByTestId('image-url-input');
  await input.click();
  await page.keyboard.type('not-a-url');

  await expect(
    page
      .locator('[data-slot="popover-content"]')
      .getByRole('button', { name: 'Insert' })
  ).toBeDisabled();
});

test('拖拽左右手柄调整图片宽度', async () => {
  await insertImageByUrl(IMG_URL);
  await expect(page.locator('[data-slate-editor] img')).toBeVisible();

  const widthBefore = await page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="image-resizable"]'
    ) as HTMLElement | null;
    return el?.style.width;
  });

  const handle = page.getByTestId('image-resize-handle-right');
  await handle.hover();
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle not found');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const widthAfter = await page.evaluate(
        () =>
          (
            document.querySelector(
              '[data-testid="image-resizable"]'
            ) as HTMLElement | null
          )?.style.width
      );
      return widthAfter && widthAfter !== widthBefore;
    })
    .toBeTruthy();
});

test('点击图片选中后可删除', async () => {
  await insertImageByUrl(IMG_URL);
  await expect(page.locator('[data-slate-editor] img')).toBeVisible();

  await page.locator('[data-slate-editor] img').click();
  await page.keyboard.press('Backspace');

  await expect(page.locator('[data-slate-editor] img')).toBeHidden();
});
