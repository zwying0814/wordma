import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;

  // 从编辑器切到分类/标签管理页
  await page.evaluate(() => {
    window.location.hash = '#/taxonomy';
  });
  await expect(page.getByTestId('taxonomy-page')).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

/** 切走再切回，触发管理页重挂载刷新 */
async function leaveAndReturn() {
  await page.evaluate(() => {
    window.location.hash = '#/articles';
  });
  await page.evaluate(() => {
    window.location.hash = '#/taxonomy';
  });
  await expect(page.getByTestId('taxonomy-page')).toBeVisible();
}

test('T9: 新建分类与标签（计数 0 篇）', async () => {
  await page.getByTestId('category-name-input').fill('教程');
  await page.getByTestId('category-create').click();
  await page.getByTestId('tag-name-input').fill('随笔');
  await page.getByTestId('tag-create').click();

  await expect(
    page.getByTestId('category-item-教程').filter({ hasText: '0 篇' })
  ).toBeVisible();
  await expect(
    page.getByTestId('tag-item-随笔').filter({ hasText: '0 篇' })
  ).toBeVisible();
});

test('T9: 重复新建同名 → 复用（列表不重复）', async () => {
  await page.getByTestId('tag-name-input').fill('随笔');
  await page.getByTestId('tag-create').click();
  // 等创建的异步回写完成（输入框清空）再进行下一次
  await expect(page.getByTestId('tag-name-input')).toHaveValue('');
  await page.getByTestId('tag-name-input').fill('随笔');
  await page.getByTestId('tag-create').click();

  await expect(
    page.getByTestId('tag-item-随笔')
  ).toHaveCount(1);
});

test('T9: 重命名生效；撞名 → 行内错误', async () => {
  await page.getByTestId('tag-name-input').fill('甲');
  await page.getByTestId('tag-create').click();
  await expect(page.getByTestId('tag-name-input')).toHaveValue('');
  await page.getByTestId('tag-name-input').fill('乙');
  await page.getByTestId('tag-create').click();

  // 正常重命名
  await page.getByRole('button', { name: '重命名 甲' }).click();
  await page.getByTestId('tag-rename-input').fill('丙');
  await page.getByTestId('tag-rename-confirm').click();
  await expect(page.getByTestId('tag-item-丙')).toBeVisible();

  // 撞名：丙 → 乙
  await page.getByRole('button', { name: '重命名 丙' }).click();
  await page.getByTestId('tag-rename-input').fill('乙');
  await page.getByTestId('tag-rename-confirm').click();
  await expect(page.getByTestId('tag-rename-error')).toContainText(
    '标签名称已存在'
  );
});

test('T9: 删除标签 → 移除', async () => {
  await page.getByTestId('tag-name-input').fill('待删除');
  await page.getByTestId('tag-create').click();
  await expect(page.getByTestId('tag-item-待删除')).toBeVisible();

  await page.getByRole('button', { name: '删除 待删除' }).click();
  await page.getByTestId('tag-delete-confirm').click();

  await expect(page.getByTestId('tag-item-待删除')).toBeHidden();
});

test('T9: articleCount 与实际文章数一致（含删除文章后归零）', async () => {
  // 先建标签
  await page.getByTestId('tag-name-input').fill('计数');
  await page.getByTestId('tag-create').click();

  // 通过 IPC 建 1 篇文章并关联该标签（不经编辑器 UI）
  const tagId = await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    const tags = (await api.invoke('list_tags', {
      siteId: active.id,
    })) as { id: number; name: string }[];
    return Number(tags.find((t) => t.name === '计数')!.id);
  });
  const article = (await page.evaluate(async (tag: number) => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('create_article', {
      siteId: active.id,
      title: '计数文章',
      tagIds: [tag],
    });
  }, tagId)) as { id: number };

  await leaveAndReturn();
  await expect(page.getByTestId('tag-item-计数').filter({ hasText: '1 篇' })).toBeVisible();

  // 删除文章 → 计数归零
  await page.evaluate((id: number) =>
    (window as any).api.invoke('delete_article', { id })
  , Number(article.id));
  await leaveAndReturn();
  await expect(page.getByTestId('tag-item-计数').filter({ hasText: '0 篇' })).toBeVisible();
});
