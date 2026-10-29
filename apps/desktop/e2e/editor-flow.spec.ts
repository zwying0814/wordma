import { expect, test } from '@playwright/test';

type E2EState = {
  writes: Array<{ path: string; content: string }>;
  previewStarts: number;
  previewStops: number;
  builds: number;
  calls: string[];
  newWorkspaceInitialized: boolean;
};

async function state(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const value = (window as Window & {
      __WORDMA_E2E__?: E2EState;
    }).__WORDMA_E2E__;

    return value
      ? {
          writes: value.writes,
          previewStarts: value.previewStarts,
          previewStops: value.previewStops,
          builds: value.builds,
          calls: value.calls,
          newWorkspaceInitialized:
            value.newWorkspaceInitialized,
        }
      : null;
  });
}

test('打开工作区 → 编辑保存 → 预览 → 发布', async ({
  page,
}) => {
  await page.goto('/?e2e=1');

  await page
    .getByRole('button', { name: /E2E Workspace/ })
    .click();

  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await expect(
    page.locator('main').getByText('已保存'),
  ).toBeVisible();

  const updated = `---
title: E2E Updated
---

# E2E Updated

Edited body from Playwright.
`;

  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(updated);

  await expect(page.getByText('未保存')).toBeVisible();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(
    page.locator('main').getByText('已保存'),
  ).toBeVisible();

  await expect
    .poll(async () => (await state(page))?.writes.length)
    .toBe(1);
  const saved = await state(page);
  expect(saved?.writes[0]?.path).toBe(
    'content/posts/hello.mdx',
  );
  expect(saved?.writes[0]?.content).toContain(
    'Edited body from Playwright.',
  );

  await page.getByRole('button', { name: '预览' }).click();
  await expect(
    page.getByRole('button', { name: '停止预览' }),
  ).toBeVisible();
  expect((await state(page))?.previewStarts).toBe(1);

  await page
    .getByRole('button', { name: '停止预览' })
    .click();
  await expect(
    page.getByRole('button', { name: '预览' }),
  ).toBeVisible();
  expect((await state(page))?.previewStops).toBe(1);

  await page.getByRole('button', { name: '发布' }).click();
  await expect(page.getByText('发布站点')).toBeVisible();
  await page
    .getByRole('button', { name: '开始发布' })
    .click();

  await expect(page.getByText('发布完成').first()).toBeVisible();
  await expect(page.getByText('3 个路由')).toBeVisible();
  expect((await state(page))?.builds).toBe(1);
});

test('打开未初始化文件夹时确认后再初始化', async ({
  page,
}) => {
  await page.goto('/?e2e=1');

  await page
    .getByRole('button', { name: /New Project/ })
    .click();

  await expect(
    page.getByText('初始化笔记空间？'),
  ).toBeVisible();

  await page.getByRole('button', { name: '取消' }).click();
  await expect(
    page.getByRole('button', { name: /New Project/ }),
  ).toBeVisible();
  expect((await state(page))?.newWorkspaceInitialized).toBe(
    false,
  );

  await page
    .getByRole('button', { name: /New Project/ })
    .click();
  await page.getByRole('button', { name: '初始化' }).click();

  await expect(page.locator('.cm-content')).toBeVisible();
  const after = await state(page);
  expect(after?.calls).toContain('initialize_workspace');
  expect(after?.newWorkspaceInitialized).toBe(true);
});
