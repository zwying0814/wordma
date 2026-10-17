import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

// T1 · 主进程打包管线 + 启动骨架

test('T1: 隔离数据目录下生成 wordma.db', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  expect(fs.existsSync(path.join(launched.dataDir, 'wordma.db'))).toBeTruthy();

  await app.close();
});

test('T1: preload 暴露 window.api 且 app_info 可用', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  const info = (await page.evaluate(() =>
    (window as any).api.invoke('app_info')
  )) as { name: string; version: string; electron: string; node: string };

  expect(info.name).toBe('wordma');
  expect(info.electron).toBeTruthy();
  expect(info.node).toBeTruthy();

  await app.close();
});

test('T1: 未注册的通道被拒绝', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  await expect(
    page.evaluate(() => (window as any).api.invoke('not_a_channel'))
  ).rejects.toThrow();

  await app.close();
});

// T2 · 数据库层

test('T2: 全部 9 张表已创建', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  const tables = (await page.evaluate(() =>
    (window as any).api.invoke('db_tables')
  )) as string[];

  for (const table of [
    'sites',
    'settings',
    'categories',
    'tags',
    'articles',
    'article_tags',
    'article_categories',
    'media',
    'pages',
  ]) {
    expect(tables).toContain(table);
  }

  await app.close();
});

// T3 · 站点服务 + IPC

test('T3: 站点 CRUD、激活持久化、校验、级联清理', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-e2e-'));

  // 第一次启动：创建站点并激活
  const first = await launchDesktop({ dataDir, seed: false });
  app = first.app;
  page = first.page;

  const site = (await page.evaluate(() =>
    (window as any).api.invoke('create_site', {
      name: '我的博客',
      description: '测试站点',
    })
  )) as { id: number; name: string; description: string | null };

  expect(Number(site.id)).toBeGreaterThan(0);
  expect(site.name).toBe('我的博客');

  await page.evaluate((id: number) =>
    (window as any).api.invoke('set_active_site', { id })
  , Number(site.id));

  await app.close();

  // 第二次启动（同一数据目录）：激活站点持久化
  const second = await launchDesktop({ dataDir, seed: false });
  app = second.app;
  page = second.page;

  const active = (await page.evaluate(() =>
    (window as any).api.invoke('get_active_site')
  )) as { id: number } | null;
  expect(Number(active?.id)).toBe(Number(site.id));

  // 更新：清空描述
  const updated = (await page.evaluate((id: number) =>
    (window as any).api.invoke('update_site', {
      id,
      name: '改名博客',
    })
  , Number(site.id))) as { name: string; description: string | null };
  expect(updated.name).toBe('改名博客');
  expect(updated.description).toBeNull();

  // 超长站点名被拒（上限 30）
  await expect(
    page.evaluate(() =>
      (window as any).api.invoke('create_site', { name: 'x'.repeat(31) })
    )
  ).rejects.toThrow(/30/);

  // 列表只有 1 个站点
  const sites = (await page.evaluate(() =>
    (window as any).api.invoke('list_sites')
  )) as unknown[];
  expect(sites).toHaveLength(1);

  // 删除站点 → 列表清空 + 激活标记清理
  await page.evaluate((id: number) =>
    (window as any).api.invoke('delete_site', { id })
  , Number(site.id));

  const after = (await page.evaluate(() =>
    (window as any).api.invoke('list_sites')
  )) as unknown[];
  expect(after).toHaveLength(0);

  const activeAfter = (await page.evaluate(() =>
    (window as any).api.invoke('get_active_site')
  )) as unknown;
  expect(activeAfter).toBeNull();

  await app.close();
});
