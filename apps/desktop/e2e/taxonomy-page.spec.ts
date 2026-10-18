import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;

  // 从编辑器切到标签页（分类页另有用例）
  await goTags();
});

test.afterEach(async () => {
  if (app) await app.close();
});

async function goTags() {
  await page.evaluate(() => {
    window.location.hash = '#/tags';
  });
  await expect(page.getByTestId('tags-page')).toBeVisible();
}

async function goCategories() {
  await page.evaluate(() => {
    window.location.hash = '#/categories';
  });
  await expect(page.getByTestId('categories-page')).toBeVisible();
}

/** 切走再切回，触发管理页重挂载刷新 */
async function leaveAndReturn(go: () => Promise<void>) {
  await page.evaluate(() => {
    window.location.hash = '#/articles';
  });
  await go();
}

/** 走真实 UI：新建按钮 → 弹窗输入 → 创建 */
async function createTag(name: string) {
  await page.getByTestId('tag-new').click();
  await page.getByTestId('tag-name-input').fill(name);
  await page.getByTestId('tag-create').click();
  await expect(page.getByTestId('tag-name-input')).toBeHidden();
}

async function createCategory(name: string) {
  await page.getByTestId('category-new').click();
  await page.getByTestId('category-name-input').fill(name);
  await page.getByTestId('category-create').click();
  await expect(page.getByTestId('category-name-input')).toBeHidden();
}

test('T9: 标签与分类各自独立成页，新建后计数 0 篇', async () => {
  await createTag('随笔');
  await expect(
    page.getByTestId('tag-item-随笔').filter({ hasText: '0 篇' })
  ).toBeVisible();
  // 标签页不应出现分类
  await expect(page.getByTestId('category-item-教程')).toHaveCount(0);

  await goCategories();
  await createCategory('教程');
  await expect(
    page.getByTestId('category-item-教程').filter({ hasText: '0 篇' })
  ).toBeVisible();
  await expect(page.getByTestId('tag-item-随笔')).toHaveCount(0);
});

test('T9: 重复新建同名 → 复用（列表不重复）', async () => {
  await createTag('随笔');
  await createTag('随笔');

  await expect(page.getByTestId('tag-item-随笔')).toHaveCount(1);
});

test('T9: 重命名生效；撞名 → 行内错误', async () => {
  await createTag('甲');
  await createTag('乙');

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
  await createTag('待删除');
  await expect(page.getByTestId('tag-item-待删除')).toBeVisible();

  await page.getByRole('button', { name: '删除 待删除' }).click();
  await page.getByTestId('tag-delete-confirm').click();

  await expect(page.getByTestId('tag-item-待删除')).toBeHidden();
});

test('T9: articleCount 与实际文章数一致（含删除文章后归零）', async () => {
  // 先建标签
  await createTag('计数');

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

  await leaveAndReturn(goTags);
  await expect(page.getByTestId('tag-item-计数').filter({ hasText: '1 篇' })).toBeVisible();

  // 删除文章 → 计数归零
  await page.evaluate((id: number) =>
    (window as any).api.invoke('delete_article', { id })
  , Number(article.id));
  await leaveAndReturn(goTags);
  await expect(page.getByTestId('tag-item-计数').filter({ hasText: '0 篇' })).toBeVisible();
});
