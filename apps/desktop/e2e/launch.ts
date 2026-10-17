import type { ElectronApplication, Page } from '@playwright/test';

import {
  ensureSession,
  getSharedDataDir,
  remount,
  startSession,
  wipeState,
} from './session';

/**
 * 启动（或复用）桌面端，返回编辑器 E2E 的常规前置状态。
 *
 * 本套件一个 Playwright worker 只跑一个 Electron 进程：
 * - **不传 `dataDir`**：复用共享实例，并先重置成干净库（清数据目录 → 播种 → 重挂载页面）。
 *   每次调用都从「全新启动」的状态开始，但省掉了进程启动 + 首屏加载。
 * - **传 `dataDir`**：真·重启到该目录（用于验证「保存 → 重启后还原」这类持久化语义，
 *   见 article-editor / pages / smoke2）。目录由调用方提供，不做清理。
 *
 * 注意：返回的 `app.close()` 是**空操作** —— 进程由套件统一管理，下一个用例的
 * `launchDesktop()` 负责把状态重置干净（spec 里的 `afterEach(app.close())` 因此无害）。
 * 需要真正重启进程请显式传 `dataDir`。
 */

/** 编辑器相关用例依赖的演示内容（标题/富文本/引用等文案断言的来源） */
const DEMO_ARTICLE_HTML =
  '<h1>用 Plate 写博客</h1><p>支持 <strong>粗体</strong>、<em>斜体</em>、<u>下划线</u>、<code>inline code</code>、<kbd>⌘+B</kbd> 和 <mark>高亮</mark>。</p><blockquote><p>这是一段引用。</p></blockquote><p></p>';

export type LaunchOptions = {
  /** 数据目录（显式传入 ⇒ 真重启到该目录，不做清理） */
  dataDir?: string;
  /**
   * 是否播种测试站点并进入编辑器（默认 true —— 编辑器 E2E 的前置状态）。
   * seed=false 时停留在启动页（无站点则为 Welcome），供应用壳/服务类测试使用。
   */
  seed?: boolean;
  /** 播种文章的正文 HTML（默认演示内容） */
  articleContent?: string;
};

type Seeded = { siteId: number; articleId: number };

/** `app.close()` 在本套件里是空操作：进程由 session 统一管理（见文件头说明） */
function withSharedLifecycle(app: ElectronApplication): ElectronApplication {
  return new Proxy(app, {
    get(target, prop, receiver) {
      if (prop === 'close') {
        return async () => {
          /* 不杀进程：下一个用例的 launchDesktop() 会重置成干净状态 */
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function launchDesktop(
  options: LaunchOptions = {}
): Promise<{
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  seeded: Seeded | null;
}> {
  const {
    dataDir: explicitDataDir,
    seed = true,
    articleContent = DEMO_ARTICLE_HTML,
  } = options;

  // 显式目录：真重启（保留持久化用例的重启语义）
  if (explicitDataDir) {
    const session = await startSession(explicitDataDir);
    const seeded = seed ? await seedArticle(session.page, articleContent) : null;
    if (seeded) await openEditor(session.page, seeded.articleId);
    return {
      app: withSharedLifecycle(session.app),
      page: session.page,
      dataDir: session.dataDir,
      seeded,
    };
  }

  // 共享目录：复用实例，重置成干净状态
  const session = await ensureSession(getSharedDataDir());

  // 清路由 → 清库 → 播种 → 重挂载：播种必须早于渲染层挂载，
  // 否则 SiteContext 会缓存到空站点、路由被 Welcome 兜底
  await session.page.evaluate(() =>
    window.history.replaceState(null, '', window.location.pathname)
  );
  await wipeState();
  const seeded = seed ? await seedArticle(session.page, articleContent) : null;
  await remount();

  if (seeded) await openEditor(session.page, seeded.articleId);

  return {
    app: withSharedLifecycle(session.app),
    page: session.page,
    dataDir: session.dataDir,
    seeded,
  };
}

/** 播种：确保站点存在并激活，确保有一篇文章 */async function seedArticle(
  page: Page,
  articleContent: string
): Promise<Seeded> {
  return (await page.evaluate(async (content: string) => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    let siteId = active?.id;
    if (!siteId) {
      const site = await api.invoke('create_site', { name: '测试站点' });
      siteId = site.id;
      await api.invoke('set_active_site', { id: siteId });
    }
    const articles = await api.invoke('list_articles', { siteId });
    let articleId = articles[0]?.id;
    if (!articleId) {
      const article = await api.invoke('create_article', {
        siteId,
        title: '演示文章',
        content,
      });
      articleId = article.id;
    }
    return { siteId: Number(siteId), articleId: Number(articleId) };
  }, articleContent)) as Seeded;
}

async function openEditor(page: Page, articleId: number): Promise<void> {
  await page.evaluate((id: number) => {
    window.location.hash = `#/editor/${id}`;
  }, articleId);
  await page.waitForSelector('[data-slate-editor="true"]', { timeout: 30_000 });
}

/**
 * 等编辑器真正拿到 DOM 焦点再操作键盘。
 *
 * 从工具栏菜单插入内容（如代码块）后，菜单项会短暂持有焦点，编辑器要等菜单
 * 关闭动画结束才拿到焦点；这期间 `page.keyboard.type()` 的按键会落到菜单项上
 * 而丢失。插入动作完成后打字前先调用本函数。
 */
export async function waitForEditorFocus(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('data-slate-editor') === 'true'
  );
}
