import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;
let dataDir: string;
let siteDir: string;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
  dataDir = launched.dataDir;
  siteDir = launched.seeded?.siteDir ?? path.join(launched.dataDir, 'site-1');

  // 主题卡片与主题设置都在主题页
  await page.evaluate(() => {
    window.location.hash = '#/themes';
  });
  await expect(page.getByTestId('themes-page')).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

/** 造一个带 text/number/switch/select 设置项的自制主题并启用 */
async function seedTheme(name: string, displayName: string) {
  const themeDir = path.join(siteDir, 'themes', name);
  fs.mkdirSync(path.join(themeDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(themeDir, 'theme.yaml'),
    [
      `name: ${name}`,
      `displayName: ${displayName}`,
      'version: 1.0.0',
      'author: test',
      'layout: single',
      'settings:',
      '  - key: footerText',
      '    label: 页脚文案',
      '    type: text',
      '    default: 默认页脚',
      '  - key: postsPerPage',
      '    label: 每页文章数',
      '    type: number',
      '    default: 10',
      '  - key: showRss',
      '    label: 显示 RSS',
      '    type: switch',
      '    default: true',
      '  - key: density',
      '    label: 密度',
      '    type: select',
      '    default: cozy',
      '    options:',
      '      - cozy',
      '      - compact',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(themeDir, 'templates', 'base.ejs'),
    '<!DOCTYPE html><html><body><%- body %><footer><%= footerText %></footer></body></html>'
  );
  fs.writeFileSync(
    path.join(themeDir, 'templates', 'index.ejs'),
    '<% for (const post of posts) { %><p><%= post.title %></p><% } %>'
  );
  fs.writeFileSync(path.join(themeDir, 'assets', 'style.css'), '.t { color: red; }');

  await page.evaluate(
    ({ siteId, themeName }) =>
      (window as any).api.invoke('set_active_theme', { siteId, name: themeName }),
    {
      siteId: await page.evaluate(async () => {
        const api = (window as any).api;
        const active = await api.invoke('get_active_site');
        return active.id as number;
      }),
      themeName: name,
    }
  );

  // 让设置页重新拉取主题列表
  await page.reload();
  await expect(page.getByTestId('themes-page')).toBeVisible();
}

test('T21: 主题卡片列表与 schema 驱动表单', async () => {
  await seedTheme('settings-theme', '设置主题');

  // 卡片：内置 default + 自制主题，自制主题为使用中
  await expect(page.getByTestId('theme-card')).toHaveCount(2);
  await expect(
    page.getByTestId('theme-card').filter({ hasText: '设置主题' })
  ).toContainText('使用中');

  // schema 驱动的控件：text / number / switch / select 各一
  await expect(page.getByTestId('theme-setting-footerText')).toHaveValue('默认页脚');
  await expect(page.getByTestId('theme-setting-postsPerPage')).toHaveValue('10');
  await expect(page.getByTestId('theme-setting-showRss')).toBeVisible();
  await expect(page.getByTestId('theme-setting-density')).toHaveValue('cozy');
});

test('T21: 修改设置保存后渲染产物体现', async () => {
  await seedTheme('settings-theme', '设置主题');

  await page.getByTestId('theme-setting-footerText').fill('页脚来自设置');
  await page.getByTestId('theme-settings-save').click();
  await expect(page.getByTestId('theme-settings-result')).toHaveText('已保存');

  // 渲染产物里的页脚文案跟随设置
  const report = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { outputDir: string };

  const indexHtml = fs.readFileSync(path.join(report.outputDir, 'index.html'), 'utf8');
  expect(indexHtml).toContain('页脚来自设置');
});

test('T21: 非法值保存被拒', async () => {
  await seedTheme('settings-theme', '设置主题');

  await page.getByTestId('theme-setting-postsPerPage').fill('abc');
  await page.getByTestId('theme-settings-save').click();

  await expect(page.getByTestId('theme-settings-result')).toContainText('必须是数字');

  // 未落库：重新读取仍是旧值
  const stored = await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('get_theme_settings', { siteId: active.id });
  });
  expect((stored as any).values.postsPerPage).toBe(10);
});

test('T21: 切换主题后表单跟随新主题的 schema', async () => {
  await seedTheme('settings-theme', '设置主题');

  // 切回内置主题：schema 只有 footerText / postsPerPage
  await page.getByTestId('theme-activate-default').click();
  await expect(
    page.getByTestId('theme-card').filter({ hasText: '默认主题' })
  ).toContainText('使用中');

  await expect(page.getByTestId('theme-setting-footerText')).toBeVisible();
  await expect(page.getByTestId('theme-setting-showRss')).toHaveCount(0);
  await expect(page.getByTestId('theme-setting-density')).toHaveCount(0);
});
