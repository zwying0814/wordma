import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LaunchOptions = {
  /** 数据目录（默认每次独立临时目录；持久化类测试传同一目录） */
  dataDir?: string;
  /**
   * 是否播种测试站点并进入编辑器（默认 true —— 编辑器 E2E 的前置状态）。
   * seed=false 时停留在启动页（无站点则为 Welcome），供应用壳/服务类测试使用。
   */
  seed?: boolean;
};

export async function launchDesktop(
  options: LaunchOptions = {}
): Promise<{
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  seeded: { siteId: number; articleId: number } | null;
}> {
  const { dataDir: dataDirOption, seed = true } = options;
  const dataDir =
    dataDirOption ?? fs.mkdtempSync(path.join(os.tmpdir(), 'wordma-e2e-'));

  const app = await electron.launch({
    args: ['electron/main.mjs'],
    env: { ...process.env, WORDMA_DATA_DIR: dataDir },
  });

  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean((window as any).api));

  let seeded: { siteId: number; articleId: number } | null = null;

  if (seed) {
    // 播种：确保站点存在并激活，确保有一篇文章，然后进入编辑器
    seeded = (await page.evaluate(async () => {
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
        });
        articleId = article.id;
      }
      return { siteId: Number(siteId), articleId: Number(articleId) };
    })) as { siteId: number; articleId: number };

    await page.evaluate((id: number) => {
      window.location.hash = `#/editor/${id}`;
    }, seeded.articleId);

    await page.waitForSelector('[data-slate-editor="true"]', { timeout: 30_000 });
  }

  return { app, page, dataDir, seeded };
}
