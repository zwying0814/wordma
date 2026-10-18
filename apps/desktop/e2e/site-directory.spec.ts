import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { launchDesktop } from './launch';

/**
 * 站点目录模型（一站点一目录）：
 * - 创建站点时选择目录，wordma.db / media / themes / preview / publish 全在该目录下
 * - 站点元信息在 {目录}/wordma.site.yaml；应用私有根只放 registry.json（站点登记表）
 * - 删除站点只移除登记，磁盘目录保留；再选同一目录即「重开」，内容完好
 */

let app: ElectronApplication;
let page: Page;
let root: string;

const tempRoot = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-sitedir-'));

test.beforeEach(async () => {
  root = tempRoot();
});

test.afterEach(async () => {
  if (app) await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});

/** 直接经 IPC 建站（E2E 无法操作系统目录选择框） */
const createSite = (dir: string, name = '我的博客') =>
  page.evaluate(
    ([d, n]: [string, string]) =>
      (window as any).api.invoke('create_site', { name: n, dir: d }),
    [dir, name]
  ) as Promise<{ id: number; name: string; dir: string }>;

const listArticles = () =>
  page.evaluate(() =>
    (window as any).api.invoke('list_articles')
  ) as Promise<{ id: number; title: string; slug: string }[]>;

test('创建站点：数据落在所选目录，应用私有侧只有 registry', async () => {
  // 站点目录刻意放在应用私有根之外（真实场景：用户自选的任意位置）
  const siteDir = tempRoot();
  ({ app, page } = await launchDesktop({ dataDir: root, seed: false }));

  const site = await createSite(siteDir);
  expect(site.dir).toBe(siteDir);

  // 站点目录：库 + 名片 + 主题（内置主题提取到站点目录）
  expect(fs.existsSync(path.join(siteDir, 'wordma.db'))).toBe(true);
  expect(fs.existsSync(path.join(siteDir, 'wordma.site.yaml'))).toBe(true);
  expect(
    fs.existsSync(path.join(siteDir, 'themes', 'default', 'theme.yaml'))
  ).toBe(true);

  // 名片内容（YAML 为站点元信息数据源）
  const yaml = fs.readFileSync(path.join(siteDir, 'wordma.site.yaml'), 'utf8');
  expect(yaml).toContain('name: 我的博客');

  // 应用私有根只应有 registry.json：文章/媒体/主题都不在这里
  expect(fs.readdirSync(root)).toEqual(['registry.json']);

  fs.rmSync(siteDir, { recursive: true, force: true });
});

test('删除站点只移除登记，目录保留且可重开（内容完好）', async () => {
  const siteDir = path.join(root, 'blog');
  ({ app, page } = await launchDesktop({ dataDir: root, seed: false }));

  const site = await createSite(siteDir);
  await page.evaluate(
    (id: number) =>
      (window as any).api.invoke('create_article', {
        title: '重开前的文章',
        slug: 'before-reopen',
      }),
    site.id
  );

  // 删除登记
  await page.evaluate(
    (id: number) => (window as any).api.invoke('delete_site', { id }),
    site.id
  );
  const sites = (await page.evaluate(() =>
    (window as any).api.invoke('list_sites')
  )) as unknown[];
  expect(sites).toHaveLength(0);
  // 磁盘目录没被动
  expect(fs.existsSync(path.join(siteDir, 'wordma.db'))).toBe(true);

  // 重开：再选同一目录 → 内容原样保留
  const reopened = await createSite(siteDir, '重开的博客');
  expect(reopened.dir).toBe(siteDir);
  const articles = await listArticles();
  expect(articles.map((a) => a.title)).toContain('重开前的文章');
  // 名片名称随入参更新，创建时间沿用旧值
  const yaml = fs.readFileSync(path.join(siteDir, 'wordma.site.yaml'), 'utf8');
  expect(yaml).toContain('name: 重开的博客');
});

test('多站点：各自独立目录与库，切换后数据互不可见', async () => {
  ({ app, page } = await launchDesktop({ dataDir: root, seed: false }));

  const siteA = await createSite(path.join(root, 'site-a'), '站点甲');
  await page.evaluate(() =>
    (window as any).api.invoke('create_article', {
      title: '甲站文章',
      slug: 'post-a',
    })
  );

  // 建站点乙会切到乙站（create_site 自动激活）
  const siteB = await createSite(path.join(root, 'site-b'), '站点乙');
  expect(await listArticles()).toHaveLength(0);

  await page.evaluate(() =>
    (window as any).api.invoke('create_article', {
      title: '乙站文章',
      slug: 'post-b',
    })
  );

  // 两个目录各有一份库
  expect(fs.existsSync(path.join(root, 'site-a', 'wordma.db'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'site-b', 'wordma.db'))).toBe(true);

  // 切回甲站：只看到甲站文章
  await page.evaluate(
    (id: number) => (window as any).api.invoke('set_active_site', { id }),
    siteA.id
  );
  const aTitles = (await listArticles()).map((a) => a.title);
  expect(aTitles).toEqual(['甲站文章']);

  // 切回乙站：只看到乙站文章
  await page.evaluate(
    (id: number) => (window as any).api.invoke('set_active_site', { id }),
    siteB.id
  );
  const bTitles = (await listArticles()).map((a) => a.title);
  expect(bTitles).toEqual(['乙站文章']);
});

test('媒体上传落在站点目录的 media/ 下（不再按站点分层）', async () => {
  const siteDir = path.join(root, 'media-site');
  ({ app, page } = await launchDesktop({ dataDir: root, seed: false }));
  await createSite(siteDir);

  // 1x1 PNG
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const item = (await page.evaluate(
    (b64: string) =>
      (window as any).api.invoke('upload_media_data', {
        base64: b64,
        originalName: 'dot.png',
      }),
    base64
  )) as { filename: string; path: string };

  expect(fs.existsSync(path.join(siteDir, 'media', item.filename))).toBe(true);
  // 返回的 path 指向站点目录下的 media/（换目录后仍按 filename 现算）
  expect(item.path).toBe(path.join(siteDir, 'media', item.filename));
});
