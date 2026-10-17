import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
});

test.afterEach(async () => {
  if (app) await app.close();
});

/** 调用调试通道校验路由规则（validateRoutingRules 纯函数） */
function validate(rules: Record<string, string>) {
  return page.evaluate((r: Record<string, string>) =>
    (window as any).api.invoke('debug_validate_routing', { rules: r })
  , rules);
}

const DEFAULT_RULES = {
  index: '/',
  indexPagination: '/page/[num]/',
  post: '/post/[slug].html',
  page: '/[slug].html',
  category: '/category/[slug]/',
  tag: '/tag/[slug]/',
  archive: '/archive/',
  feed: '/feed.xml',
};

test('T14: 默认规则全部通过且示例 URL 正确', async () => {
  const checks = (await validate(DEFAULT_RULES)) as {
    key: string;
    ok: boolean;
    example?: string;
  }[];

  const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
  for (const key of Object.keys(DEFAULT_RULES)) {
    expect(byKey[key].ok, `${key} 应通过`).toBe(true);
  }
  expect(byKey.post.example).toBe('/post/hello-world.html');
  expect(byKey.indexPagination.example).toBe('/page/2/');
  expect(byKey.category.example).toBe('/category/hello-world/');
  expect(byKey.feed.example).toBe('/feed.xml');
  expect(byKey.index.example).toBe('/');
});

test('T14: 路径穿越 .. 被拒', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    post: '/post/../[slug].html',
  })) as { key: string; ok: boolean; message?: string }[];

  expect(checks.find((c) => c.key === 'post')?.ok).toBe(false);
  expect(checks.find((c) => c.key === 'post')?.message).toContain('..');
});

test('T14: 连续斜杠 // 被拒', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    page: '//[slug].html',
  })) as { key: string; ok: boolean; message?: string }[];

  const pageCheck = checks.find((c) => c.key === 'page');
  expect(pageCheck?.ok).toBe(false);
  expect(pageCheck?.message).toContain('//');
});

test('T14: /assets 保留前缀被拒', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    page: '/assets/[slug].html',
  })) as { key: string; ok: boolean; message?: string }[];

  const pageCheck = checks.find((c) => c.key === 'page');
  expect(pageCheck?.ok).toBe(false);
  expect(pageCheck?.message).toContain('assets');
});

test('T14: 分页路由缺 [num] 被拒', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    indexPagination: '/page/',
  })) as { key: string; ok: boolean; message?: string }[];

  const check = checks.find((c) => c.key === 'indexPagination');
  expect(check?.ok).toBe(false);
  expect(check?.message).toContain('[num]');
});

test('T14: 占位符白名单（post 不允许 [foo]）', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    post: '/post/[foo].html',
  })) as { key: string; ok: boolean; message?: string }[];

  const postCheck = checks.find((c) => c.key === 'post');
  expect(postCheck?.ok).toBe(false);
  expect(postCheck?.message).toContain('[foo]');
});

test('T14: feed 不允许占位符', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    feed: '/feed/[slug].xml',
  })) as { key: string; ok: boolean; message?: string }[];

  const feedCheck = checks.find((c) => c.key === 'feed');
  expect(feedCheck?.ok).toBe(false);
});

test('T14: index 必须为 /', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    index: '/home/',
  })) as { key: string; ok: boolean; message?: string }[];

  const indexCheck = checks.find((c) => c.key === 'index');
  expect(indexCheck?.ok).toBe(false);
  expect(indexCheck?.message).toContain('index 路由必须为 /');
});

test('T14: 示例 URL 冲突检测（page 与 post 撞同一 URL）', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    post: '/post/[slug].html',
    page: '/post/[slug].html',
  })) as { key: string; ok: boolean; message?: string; example?: string }[];

  // 两条路由示例 URL 相同 → 后者在映射中被标冲突
  const conflicted = checks.filter((c) => c.ok === false);
  expect(conflicted.length).toBe(1);
  expect(conflicted[0].message).toContain('冲突');
});

test('T14: 字符集白名单（空格被拒）', async () => {
  const checks = (await validate({
    ...DEFAULT_RULES,
    archive: '/my archive/',
  })) as { key: string; ok: boolean; message?: string }[];

  const archiveCheck = checks.find((c) => c.key === 'archive');
  expect(archiveCheck?.ok).toBe(false);
});
