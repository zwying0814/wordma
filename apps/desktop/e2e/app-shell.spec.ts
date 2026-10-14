import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;

test.afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined as unknown as ElectronApplication;
  }
});

/** 通过 window.api 直接建一个站点（绕过 UI，用于构造多站点状态） */
async function createSiteViaApi(name: string): Promise<number> {
  const site = (await page.evaluate((n: string) =>
    (window as any).api.invoke('create_site', { name: n })
  , name)) as { id: number };
  return Number(site.id);
}

test('T4: 首次启动（无站点）显示 Welcome 引导页', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  await expect(page.getByTestId('welcome-site-name')).toBeVisible();
  // 无站点：主界面导航不应出现
  await expect(page.getByTestId('nav-articles')).toBeHidden();
});

test('T4: Welcome 创建第一个站点 → 进入主界面', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  await page.getByTestId('welcome-site-name').fill('我的博客');
  await page.getByTestId('welcome-create').click();

  // 进入主界面：侧边导航出现，URL 落到文章列表
  await expect(page.getByTestId('nav-articles')).toBeVisible();
  await expect(page.getByTestId('site-switcher')).toContainText('我的博客');

  // 空描述时也应允许创建（可选字段）
  await expect(page.getByTestId('nav-settings')).toBeVisible();
});

test('T4: 站点切换器切换后激活站点跟随', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  // Welcome 建站点 A
  await page.getByTestId('welcome-site-name').fill('站点甲');
  await page.getByTestId('welcome-create').click();
  await expect(page.getByTestId('nav-articles')).toBeVisible();

  // IPC 建站点 B 后刷新，使上下文重新加载
  const siteBId = await createSiteViaApi('站点乙');
  await page.reload();
  await expect(page.getByTestId('site-switcher')).toBeVisible();

  // 打开切换器，选择站点乙
  await page.getByTestId('site-switcher').click();
  await page.getByRole('menuitem', { name: '站点乙' }).click();

  await expect(page.getByTestId('site-switcher')).toContainText('站点乙');

  // 激活状态经 IPC 验证
  const active = (await page.evaluate(() =>
    (window as any).api.invoke('get_active_site')
  )) as { id: number };
  expect(Number(active.id)).toBe(siteBId);
});

test('T4: 刷新后激活站点保持，不回 Welcome', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  await page.getByTestId('welcome-site-name').fill('持久站点');
  await page.getByTestId('welcome-create').click();
  await expect(page.getByTestId('nav-articles')).toBeVisible();

  await page.reload();

  await expect(page.getByTestId('nav-articles')).toBeVisible();
  await expect(page.getByTestId('site-switcher')).toContainText('持久站点');
});

test('T4: 编辑器路由不依赖站点（直连渲染）', async () => {
  const launched = await launchDesktop({ seed: false });
  app = launched.app;
  page = launched.page;

  // 无站点，但 /editor/:id 直连可渲染（迁移期语义，保护编辑器 E2E）
  await page.evaluate(() => {
    window.location.hash = '#/editor/1';
  });

  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();
});
