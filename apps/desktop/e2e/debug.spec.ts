import { expect, test } from './fixtures';

import { launchDesktop } from './launch';

let app: any;
let page: any;

test.beforeEach(async () => {
  ({ app, page } = await launchDesktop({ seed: true }));
  await page.evaluate(() => {
    window.location.hash = '#/articles';
  });
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();

  const dataUri = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3563d9';
    ctx.fillRect(0, 0, 300, 100);
    return canvas.toDataURL('image/png');
  });
  await page.evaluate(async (uri: string) => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    await api.invoke('upload_media_data', {
      siteId: active.id,
      base64: uri.split(',')[1],
      originalName: 'island.png',
    });
  }, dataUri);

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Image', exact: true })
    .click();
  const grid = page.getByTestId('media-picker-grid');
  await expect(grid).toBeVisible();
  await grid.locator('img').first().click();
  await expect(page.locator('[data-slate-editor] img')).toBeVisible();
});

test.afterEach(async () => { if (app) await app.close(); });

const getImgX = () => page.evaluate(() =>
  Math.round(document.querySelector('[data-slate-editor] img')!.getBoundingClientRect().left)
);

/**
 * 图片对齐可连续设置：第一次点图片选中后，后续每次只开菜单选对齐
 * （不再重新点图片）。回归点：菜单关闭时弹层会夺走 DOM 焦点，若不在
 * 关闭动画结束后恢复选区，slate 会把模型选区重置到首行，第二次对齐
 * 就会落到第一段而不是图片上。
 */
test('图片对齐可连续设置（菜单开关后选区保持）', async () => {
  const alignBtn = page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Align' });

  const alignOnce = async (label: string, expectedX: number) => {
    await alignBtn.click();
    await page.getByRole('menuitemradio', { name: `Align ${label}` }).click();
    await page.waitForTimeout(250);
    expect(await getImgX()).toBe(expectedX);
  };

  // 第一次：点图片选中 → 右对齐
  await page.locator('[data-slate-editor] img').click();
  await alignBtn.click();
  await page.getByRole('menuitemradio', { name: 'Align right' }).click();
  await page.waitForTimeout(250);
  expect(await getImgX()).toBe(530);

  // 后续：不重新点图片，直接连续切换对齐
  await alignOnce('center', 330);
  await alignOnce('left', 130);
  await alignOnce('right', 530);
});
