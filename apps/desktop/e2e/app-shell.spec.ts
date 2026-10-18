import { expect, test } from './fixtures';
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
/** IPC 建站点：目录用应用私有根下唯一的子目录（E2E 无法操作系统目录选择框） */
async function createSiteViaApi(name: string, dir: string): Promise<number> {
  const site = (await page.evaluate(
    ([n, d]: [string, string]) =>
      (window as any).api.invoke('create_site', { name: n, dir: d }),
    [name, dir]
  )) as { id: number };
  return Number(site.id);
}

/**
 * E2E 的目录选择：先往主进程注入队列塞路径（set_e2e_directory，见
 * ipc-register.ts —— 原生对话框会挂死 headless 套件），再点「选择…」按钮走真实 UI 流程。
 * 复用进程 + remount 后的早点击会被 React 挂载竞态吞掉：最多重试 5 轮。
 */
async function chooseDir(root: string, tag: string): Promise<void> {
  const dir = `${root}/site-${tag}`;
  const inject = () =>
    page.evaluate(
      (paths: string[]) =>
        (window as any).api.invoke('set_e2e_directory', { paths }),
      [dir]
    );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await inject();
    await page.getByTestId('welcome-choose-dir').click();
    // 渐进轮询：最多 2s，每次复查并按需再注入
    for (let poll = 0; poll < 8; poll += 1) {
      await page.waitForTimeout(250);
      const shown = await page.getByTestId('welcome-site-dir').inputValue();
      if (shown === dir) return;
      await inject();
    }
  }
  throw new Error(`目录选择失败（注入 ${dir} 五轮未生效）`);
}

/** helper 成功后 React 可能仍在收敛；用例按需等待 */
function settle(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  await chooseDir(launched.dataDir, 'main');
  await settle();
  await page.getByTestId('welcome-site-name').fill('我的博客');
  await settle();
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
  await chooseDir(launched.dataDir, 'a');
  await settle();
  await page.getByTestId('welcome-site-name').fill('站点甲');
  await settle();
  await page.getByTestId('welcome-create').click();
  await expect(page.getByTestId('nav-articles')).toBeVisible();

  // IPC 建站点 B 后刷新，使上下文重新加载
    const siteBId = await createSiteViaApi(
    '站点乙',
    `${launched.dataDir}/site-b`
  );
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

  await chooseDir(launched.dataDir, 'persist');
  await settle();
  await page.getByTestId('welcome-site-name').fill('持久站点');
  await settle();
  await page.getByTestId('welcome-create').click();
  await expect(page.getByTestId('nav-articles')).toBeVisible();

  await page.reload();

  await expect(page.getByTestId('nav-articles')).toBeVisible();
  await expect(page.getByTestId('site-switcher')).toContainText('持久站点');
});

test('T8 后语义：编辑器路由访问不存在的文章显示错误态', async () => {
  // 站点目录模型：没有激活站点时库根本没打开，错误态语义要落在「库已打开但文章不存在」上
  const launched = await launchDesktop();
  app = launched.app;
  page = launched.page;

  // 库中只有演示文章：/editor/999 进入错误态（带返回栏）
  await page.evaluate(() => {
    window.location.hash = '#/editor/999';
  });

  await expect(page.getByTestId('editor-back')).toBeVisible();
  await expect(page.getByText('文章不存在')).toBeVisible();
});
