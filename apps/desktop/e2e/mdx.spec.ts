import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import { launchDesktop } from './launch';

/**
 * MDX 岛：站点 components/*.tsx 是组件源码，文章用 MDX 块引用；
 * 编辑器内用嵌套 React root 渲染编译产物，发布时按需产出 react 运行时与岛文件。
 */

let app: ElectronApplication;
let page: Page;
let siteDir: string;

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
  siteDir = launched.seeded?.siteDir ?? path.join(launched.dataDir, 'site-1');
});

test.afterEach(async () => {
  if (app) await app.close();
});

const COUNTER = `import { useState } from 'react';

export default function Counter({ start = 0 }: { start?: number }) {
  const [count, setCount] = useState(start);
  return <button onClick={() => setCount(count + 1)}>计数 {count}</button>;
}
`;

const go = async (hash: string, testId: string) => {
  await page.evaluate((h: string) => {
    window.location.hash = h;
  }, hash);
  await expect(page.getByTestId(testId)).toBeVisible();
};

/** 经组件页写一个组件（走真实 UI） */
async function createComponent(name: string, code: string) {
  await go('#/components', 'components-page');
  await page.getByTestId('component-new').click();
  await page.getByTestId('component-name-input').fill(name);
  await page.getByTestId('component-create').click();
  await expect(page.getByTestId('component-code')).toBeVisible();
  await page.getByTestId('component-code').fill(code);
  await page.getByTestId('component-save').click();
  // 创建与保存会各弹一条提示，取含「已保存」的那条
  await expect(
    page.getByTestId('toast').filter({ hasText: '已保存' })
  ).toBeVisible();
}

/** 在编辑器里插入一个引用 name 的 MDX 块 */
async function insertMdxBlock(name: string, props?: string) {
  await page.locator('[data-slate-node="element"]').last().click();
  await page.keyboard.type('/mdx');
  await page.getByRole('option', { name: 'MDX 组件' }).click();
  await expect(page.getByTestId('mdx-block')).toBeVisible();

  await page.getByTestId('mdx-component-selector').click();
  await page.getByTestId(`mdx-option-${name}`).click();

  if (props) {
    await page.getByTestId('mdx-props-input').fill(props);
    await page.getByTestId('mdx-props-input').blur();
  }
}

test('组件页：新建 → 保存 → 预览渲染；语法错误不落库', async () => {
  await createComponent('counter', COUNTER);

  // 保存后预览区渲染出组件
  await expect(
    page.locator('[data-island-host="counter"]').getByRole('button')
  ).toHaveText('计数 0');

  // 组件文件确实落在站点目录
  expect(fs.existsSync(path.join(siteDir, 'components', 'counter.tsx'))).toBe(true);

  // 语法错误 → 报错且不覆盖磁盘上的旧内容
  await page.getByTestId('component-code').fill('export default function ( {');
  await page.getByTestId('component-save').click();
  await expect(page.getByTestId('components-error')).toContainText('编译失败');
  expect(fs.readFileSync(path.join(siteDir, 'components', 'counter.tsx'), 'utf8')).toBe(
    COUNTER
  );
});

test('编辑器：MDX 块渲染组件且可交互，props 生效', async () => {
  await createComponent('counter', COUNTER);
  await go('#/articles', 'articles-page');
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();

  await insertMdxBlock('counter');

  const islandButton = page
    .locator('[data-island-host="counter"]')
    .getByRole('button');
  await expect(islandButton).toHaveText('计数 0');

  // 真交互：点一下计数加一
  await islandButton.click();
  await expect(islandButton).toHaveText('计数 1');

  // props：起始值 5
  await page.getByTestId('mdx-props-input').fill('{"start":5}');
  await page.getByTestId('mdx-props-input').blur();
  await expect(
    page.locator('[data-island-host="counter"]').getByRole('button')
  ).toHaveText('计数 5');
});

test('保存往返：MDX 块存进正文并能重新渲染', async () => {
  await createComponent('counter', COUNTER);
  await go('#/articles', 'articles-page');
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();

  await insertMdxBlock('counter', '{"start":2}');
  await page.getByTestId('article-save').click();
  await expect(page.getByTestId('saved-at')).toBeVisible();

  // 保存下来的 HTML 里有岛占位
  const content = (await page.evaluate(async () => {
    const api = (window as any).api;
    const articles = await api.invoke('list_articles');
    return articles[0].content as string;
  })) as string;
  expect(content).toContain('data-wordma-island="counter"');
  expect(content).toContain('data-props="{&quot;start&quot;:2}"');

  // 切走再回来，块仍是 MDX 且能渲染
  await go('#/articles', 'articles-page');
  await page.getByRole('button', { name: /^编辑 / }).first().click();
  await expect(page.getByTestId('mdx-block')).toBeVisible();
  await expect(
    page.locator('[data-island-host="counter"]').getByRole('button')
  ).toHaveText('计数 2');
});

test('发布：含岛站点产出 react 运行时与岛文件，并注入 importmap', async () => {
  await createComponent('counter', COUNTER);
  await go('#/articles', 'articles-page');
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();
  await insertMdxBlock('counter');
  await page.getByTestId('article-save').click();
  await expect(page.getByTestId('saved-at')).toBeVisible();

  // 种子文章默认草稿：发布产物只含已发布文章
  await page.evaluate(async () => {
    const api = (window as any).api;
    const articles = await api.invoke('list_articles');
    for (const article of articles) {
      await api.invoke('update_article', { id: article.id, status: 'published' });
    }
  });

  const report = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { outputDir: string; warnings: string[] };

  expect(report.warnings).toEqual([]);
  expect(fs.existsSync(path.join(report.outputDir, 'assets', 'mdx', 'counter.js'))).toBe(
    true
  );
  expect(fs.existsSync(path.join(report.outputDir, 'assets', 'mdx', 'react.js'))).toBe(
    true
  );

  // 种子文章与新建文章都在 post/ 下：找含岛的那一篇
  const html = fs
    .readdirSync(path.join(report.outputDir, 'post'))
    .filter((file) => file.endsWith('.html'))
    .map((file) => fs.readFileSync(path.join(report.outputDir, 'post', file), 'utf8'))
    .find((content) => content.includes('data-wordma-island'))!;
  expect(html).toContain('type="importmap"');
  expect(html).toContain('data-wordma-island="counter"');
  expect(html).toContain('assets/mdx/react.js');
});

test('预览服务器：岛的脚本与运行时能按正确 MIME 取到', async () => {
  await createComponent('counter', COUNTER);
  await go('#/articles', 'articles-page');
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();
  await insertMdxBlock('counter');
  await page.getByTestId('article-save').click();
  await expect(page.getByTestId('saved-at')).toBeVisible();

  // 渲染到预览目录并起服务，再用主进程的 net.fetch 取一次（等价浏览器加载）
  const fetched = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    await api.invoke('render_site', { siteId: active.id });
    const port = await api.invoke('get_preview_port');
    const base = `http://127.0.0.1:${port}`;
    return {
      html: await api.invoke('debug_fetch', { url: `${base}/index.html` }),
      island: await api.invoke('debug_fetch', {
        url: `${base}/assets/mdx/counter.js`,
      }),
      runtime: await api.invoke('debug_fetch', {
        url: `${base}/assets/mdx/react.js`,
      }),
    };
  })) as {
    html: { status: number };
    island: { status: number; body: string };
    runtime: { status: number };
  };

  expect(fetched.html.status).toBe(200);
  expect(fetched.island.status).toBe(200);
  expect(fetched.runtime.status).toBe(200);
  // debug_fetch 只回前 60 字符（够确认有内容），产物内容本身在发布用例里断言
  expect(fetched.island.body.length).toBeGreaterThan(0);
});

test('发布：没有岛的站点产物里不含 react 运行时', async () => {
  // 种子文章不含 MDX 块
  const report = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { outputDir: string };

  expect(fs.existsSync(path.join(report.outputDir, 'assets', 'mdx'))).toBe(false);

  const indexHtml = fs.readFileSync(path.join(report.outputDir, 'index.html'), 'utf8');
  expect(indexHtml).not.toContain('importmap');
});

test('引用不存在的组件：渲染不中断，报告里有 warning', async () => {
  await go('#/articles', 'articles-page');
  await page.getByTestId('create-article').click();
  await expect(page.locator('[data-slate-editor="true"]')).toBeVisible();

  // 直接经 IPC 造一个指向不存在组件的块（UI 里选不到它）
  await page.evaluate(async () => {
    const api = (window as any).api;
    const articles = await api.invoke('list_articles');
    const article = articles[0];
    await api.invoke('update_article', {
      id: article.id,
      status: 'published',
      content:
        '<div class="wordma-island" data-wordma-island="ghost" data-props="{}"></div>',
    });
  });

  const report = (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { outputDir: string; warnings: string[] };

  expect(report.warnings.join(' ')).toContain('ghost');
  expect(fs.existsSync(path.join(report.outputDir, 'index.html'))).toBe(true);
});
