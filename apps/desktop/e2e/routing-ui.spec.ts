import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;

  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(page.getByTestId('routing-section')).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

const renderSite = () =>
  page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  }) as Promise<{ outputDir: string; files: number }>;

test('T22: 修改 post 路由 → 保存 → 渲染产物路径跟随', async () => {
  await page.getByTestId('route-post').fill('/p/[slug].html');
  // 逐条校验结果实时更新，且通过时展示示例 URL
  await expect(page.getByTestId('route-check-post')).toContainText('示例：/p/');

  await page.getByTestId('routing-save').click();
  await expect(page.getByTestId('routing-result')).toHaveText('已保存');

  const report = await renderSite();
  expect(fs.existsSync(path.join(report.outputDir, 'post'))).toBe(false);
  const pDir = path.join(report.outputDir, 'p');
  expect(fs.existsSync(pDir)).toBe(true);
  expect(fs.readdirSync(pDir).some((file) => file.endsWith('.html'))).toBe(true);
});

test('T22: 非法规则（缺 [num] / 含 ..）被前置拦截，无法保存', async () => {
  // 分页路由缺 [num]
  await page.getByTestId('route-indexPagination').fill('/page/');
  await expect(page.getByTestId('route-check-indexPagination')).toContainText('num');
  await expect(page.getByTestId('routing-save')).toBeDisabled();

  // 含路径穿越
  await page.getByTestId('route-indexPagination').fill('/page/[num]/');
  await page.getByTestId('route-tag').fill('/tag/../[slug]/');
  await expect(page.getByTestId('route-check-tag')).toContainText('..');
  await expect(page.getByTestId('routing-save')).toBeDisabled();

  // 未落库：仍是默认规则
  const stored = await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('get_routing_rules', { siteId: active.id });
  });
  expect((stored as any).tag).toBe('/tag/[slug]/');
});

test('T22: 恢复默认后渲染回默认路径', async () => {
  await page.getByTestId('route-post').fill('/p/[slug].html');
  await page.getByTestId('routing-save').click();
  await expect(page.getByTestId('routing-result')).toHaveText('已保存');

  await page.getByTestId('routing-reset').click();
  await expect(page.getByTestId('route-post')).toHaveValue('/post/[slug].html');
  await page.getByTestId('routing-save').click();
  await expect(page.getByTestId('routing-result')).toHaveText('已保存');

  const report = await renderSite();
  expect(fs.existsSync(path.join(report.outputDir, 'post'))).toBe(true);
  expect(fs.existsSync(path.join(report.outputDir, 'p'))).toBe(false);
});
