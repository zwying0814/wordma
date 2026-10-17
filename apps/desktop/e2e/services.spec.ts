import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;
let siteId: number;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  const site = (await page.evaluate(() =>
    (window as any).api.invoke('create_site', { name: '服务测试站点' })
  )) as { id: number };
  siteId = Number(site.id);
});

test.afterEach(async () => {
  if (app) await app.close();
});

const invoke = (channel: string, payload?: unknown) =>
  page.evaluate(
    ({ channel: c, payload: p }) => (window as any).api.invoke(c, p),
    { channel, payload }
  );

// T5 · 文章服务

test('T5: 创建文章默认 slug 为 8 位小写字母、状态为 draft', async () => {
  const article = (await invoke('create_article', {
    siteId,
    title: '第一篇',
  })) as { id: number; slug: string; status: string; title: string };

  expect(article.title).toBe('第一篇');
  expect(article.status).toBe('draft');
  expect(article.slug).toMatch(/^[a-z]{8}$/);
  expect(article.content).toBe('');
  expect(article.categories).toEqual([]);
  expect(article.tags).toEqual([]);
});

test('T5: 非法 slug 被拒（大写/空格/首尾连字符/超长）', async () => {
  for (const badSlug of ['Bad Slug', '-abc', 'abc-', 'a--b', 'x'.repeat(81)]) {
    await expect(invoke('create_article', { siteId, slug: badSlug })).rejects.toThrow(
      /slug/
    );
  }
});

test('T5: 同站点 slug 唯一', async () => {
  await invoke('create_article', { siteId, slug: 'dup-slug', title: 'A' });
  await expect(
    invoke('create_article', { siteId, slug: 'dup-slug', title: 'B' })
  ).rejects.toThrow(/已被本站点其他文章使用/);

  // 不同站点互不影响
  const site2 = (await invoke('create_site', { name: '另一个站' })) as {
    id: number;
  };
  const other = (await invoke('create_article', {
    siteId: Number(site2.id),
    slug: 'dup-slug',
  })) as { id: number };
  expect(Number(other.id)).toBeGreaterThan(0);
});

test('T5: 分类/标签全量替换语义', async () => {
  const tag1 = (await invoke('create_tag', { siteId, name: '标签一' })) as {
    id: number;
  };
  const tag2 = (await invoke('create_tag', { siteId, name: '标签二' })) as {
    id: number;
  };
  const cat1 = (await invoke('create_category', {
    siteId,
    name: '分类一',
  })) as { id: number };

  const article = (await invoke('create_article', {
    siteId,
    title: '替换语义',
    tagIds: [Number(tag1.id)],
    categoryIds: [Number(cat1.id)],
  })) as { id: number; tags: { id: number }[]; categories: { id: number }[] };

  expect(article.tags.map((t) => Number(t.id))).toEqual([Number(tag1.id)]);
  expect(article.categories.map((c) => Number(c.id))).toEqual([Number(cat1.id)]);

  // 全量替换：只传 tag2 → tag1 解绑
  const updated = (await invoke('update_article', {
    id: Number(article.id),
    tagIds: [Number(tag2.id)],
  })) as { tags: { id: number }[] };
  expect(updated.tags.map((t) => Number(t.id))).toEqual([Number(tag2.id)]);

  // 不传 tagIds → 保持不变
  const kept = (await invoke('update_article', {
    id: Number(article.id),
    title: '替换语义2',
  })) as { tags: { id: number }[]; title: string };
  expect(kept.title).toBe('替换语义2');
  expect(kept.tags.map((t) => Number(t.id))).toEqual([Number(tag2.id)]);
});

test('T5: 关联不属于当前站点的分类/标签被拒', async () => {
  const otherSite = (await invoke('create_site', { name: '外部站' })) as {
    id: number;
  };
  const foreignTag = (await invoke('create_tag', {
    siteId: Number(otherSite.id),
    name: '外部标签',
  })) as { id: number };

  await expect(
    invoke('create_article', {
      siteId,
      tagIds: [Number(foreignTag.id)],
    })
  ).rejects.toThrow(/不属于当前站点/);
});

test('T5: 删除文章后标签计数归零（级联清理关联）', async () => {
  const tag = (await invoke('create_tag', { siteId, name: '计数标签' })) as {
    id: number;
  };
  const article = (await invoke('create_article', {
    siteId,
    tagIds: [Number(tag.id)],
  })) as { id: number };

  let tags = (await invoke('list_tags', { siteId })) as {
    id: number;
    articleCount: number;
  }[];
  expect(tags.find((t) => Number(t.id) === Number(tag.id))?.articleCount).toBe(1);

  await invoke('delete_article', { id: Number(article.id) });

  tags = (await invoke('list_tags', { siteId })) as {
    id: number;
    articleCount: number;
  }[];
  expect(tags.find((t) => Number(t.id) === Number(tag.id))?.articleCount).toBe(0);
});

// T6 · 分类/标签服务

test('T6: 创建重名标签复用已有行', async () => {
  const t1 = (await invoke('create_tag', { siteId, name: '重复' })) as {
    id: number;
  };
  const t2 = (await invoke('create_tag', { siteId, name: '重复' })) as {
    id: number;
  };
  expect(Number(t2.id)).toBe(Number(t1.id));

  const tags = (await invoke('list_tags', { siteId })) as unknown[];
  expect(tags).toHaveLength(1);
});

test('T6: 重命名标签撞名报错、正常改名生效', async () => {
  const a = (await invoke('create_tag', { siteId, name: '甲' })) as { id: number };
  await invoke('create_tag', { siteId, name: '乙' });

  await expect(
    invoke('rename_tag', { id: Number(a.id), name: '乙' })
  ).rejects.toThrow(/标签名称已存在/);

  const renamed = (await invoke('rename_tag', {
    id: Number(a.id),
    name: '丙',
  })) as { name: string };
  expect(renamed.name).toBe('丙');
});

test('T6: 分类同样具备复用/改名/删除语义', async () => {
  const c1 = (await invoke('create_category', { siteId, name: '教程' })) as {
    id: number;
  };
  const c2 = (await invoke('create_category', { siteId, name: '教程' })) as {
    id: number;
  };
  expect(Number(c2.id)).toBe(Number(c1.id));

  await expect(
    invoke('create_category', { siteId, name: 'x'.repeat(21) })
  ).rejects.toThrow(/20/);

  await invoke('delete_category', { id: Number(c1.id) });
  const cats = (await invoke('list_categories', { siteId })) as unknown[];
  expect(cats).toHaveLength(0);
});

test('T6: 标签名超长被拒', async () => {
  await expect(
    invoke('create_tag', { siteId, name: 'x'.repeat(21) })
  ).rejects.toThrow(/20/);
});
