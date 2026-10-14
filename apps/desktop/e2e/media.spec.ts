import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;

  // 进入媒体库页
  await page.evaluate(() => {
    window.location.hash = '#/media';
  });
  await expect(page.getByTestId('media-page')).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('T10: base64 上传 png → 网格出现 + 协议可访问', async () => {
  await page.evaluate(async (b64: string) => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('upload_media_data', {
      siteId: active.id,
      base64: b64,
      originalName: 'dot.png',
    });
  }, PNG_BASE64);

  // 直接 IPC 上传后刷新页面状态
  await page.reload();
  await expect(page.getByTestId('media-page')).toBeVisible();

  await expect(
    page.getByTestId('media-grid').locator('img')
  ).toHaveCount(1);

  // wordma-media:// 协议可访问
  const status = await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    const items = (await api.invoke('list_media', {
      siteId: active.id,
    })) as { filename: string }[];
    const res = await fetch(
      `wordma-media://media/${active.id}/${items[0].filename}`
    );
    return { status: res.status, type: res.headers.get('content-type') };
  });
  expect(status.status).toBe(200);
  expect(status.type).toBe('image/png');
});

test('T10: 不支持的类型被拒（.txt）', async () => {
  await expect(
    page.evaluate(async () => {
      const api = (window as any).api;
      const active = await api.invoke('get_active_site');
      return api.invoke('upload_media_data', {
        siteId: active.id,
        base64: 'aGVsbG8=',
        originalName: 'note.txt',
      });
    })
  ).rejects.toThrow(/不支持的文件类型/);
});

test('T10: base64 超 25MB 被拒', async () => {
  const big = Buffer.alloc(26 * 1024 * 1024, 1).toString('base64');
  await expect(
    page.evaluate(async ({ b64 }: { b64: string }) => {
      const api = (window as any).api;
      const active = await api.invoke('get_active_site');
      return api.invoke('upload_media_data', {
        siteId: active.id,
        base64: b64,
        originalName: 'big.png',
      });
    }, { b64: big })
  ).rejects.toThrow(/25MB/);
});

test('T11: 编辑器插图——媒体库网格选择插入', async () => {
  // 先上传一张图
  await page.evaluate(async (b64: string) => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('upload_media_data', {
      siteId: active.id,
      base64: b64,
      originalName: 'dot.png',
    });
  }, PNG_BASE64);

  // 进入编辑器
  await page.evaluate(() => {
    window.location.hash = '#/articles';
  });
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();

  await page
    .getByTestId('fixed-toolbar')
    .getByRole('button', { name: 'Image', exact: true })
    .click();

  // 弹层里的媒体网格出现，点击缩略图插入
  const grid = page.getByTestId('media-picker-grid');
  await expect(grid).toBeVisible();
  await grid.locator('img').first().click();

  const src = await page
    .locator('[data-slate-editor] img')
    .first()
    .getAttribute('src');
  expect(src?.startsWith('wordma-media://')).toBeTruthy();

  // 图片真实加载（协议渲染成功）
  await expect
    .poll(
      async () =>
        await page
          .locator('[data-slate-editor] img')
          .first()
          .evaluate((el) => (el as HTMLImageElement).naturalWidth > 0)
    )
    .toBeTruthy();
});
