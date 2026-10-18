import { expect, test } from './fixtures';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { launchDesktop } from './launch';

let app: ElectronApplication;
let page: Page;
let dataDir: string;
let siteDir: string;

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.beforeEach(async () => {
  const launched = await launchDesktop({ seed: true });
  app = launched.app;
  page = launched.page;
  dataDir = launched.dataDir;
  siteDir = launched.seeded?.siteDir ?? path.join(launched.dataDir, 'site-1');
});

test.afterEach(async () => {
  if (app) await app.close();
});

/** 造 T15 验收数据：2 篇发布 + 1 篇草稿 + 分类/标签 + 1 页面 + 1 张图 */
async function seedRenderData() {
  return page.evaluate(async (b64: string) => {
    const api = (window as any).api;
    const active = (await api.invoke('get_active_site')) as { id: number };
    const siteId = active.id;

    const category = (await api.invoke('create_category', {
      siteId,
      name: '教程',
    })) as { id: number };
    const tag = (await api.invoke('create_tag', { siteId, name: '随笔' })) as {
      id: number;
    };

    const published1 = (await api.invoke('create_article', {
      siteId,
      title: '第一篇发布',
      slug: 'first-post',
      content: '<p>第一篇内容，带图 <img src="wordma-media://media/' + siteId + '/dot.png" /></p>',
      status: 'published',
      categoryIds: [Number(category.id)],
      tagIds: [Number(tag.id)],
    })) as { id: number };

    await api.invoke('upload_media_data', {
      siteId,
      base64: b64,
      originalName: 'dot.png',
    });

    const published2 = (await api.invoke('create_article', {
      siteId,
      title: '第二篇发布',
      slug: 'second-post',
      content: '<p>第二篇内容</p>',
      status: 'published',
    })) as { id: number };

    const draft = (await api.invoke('create_article', {
      siteId,
      title: '未发布的草稿',
      slug: 'draft-post',
      content: '<p>草稿内容</p>',
      status: 'draft',
    })) as { id: number };

    const pageItem = (await api.invoke('create_page', {
      siteId,
      title: '关于本站',
      slug: 'about',
      content: '<p>关于页面内容</p>',
    })) as { id: number };

    const mediaItem = (await api.invoke('list_media', { siteId }))[0] as {
      filename: string;
    };

    return {
      siteId,
      // taxonomySlug：中文名回退 c-{id}
      categorySlug: `c-${Number(category.id)}`,
      tagSlug: `c-${Number(tag.id)}`,
      postSlugs: ['first-post', 'second-post'],
      draftSlug: 'draft-post',
      pageSlug: 'about',
      mediaFilename: mediaItem.filename,
      publishedIds: [Number(published1.id), Number(published2.id)],
      draftId: Number(draft.id),
      pageId: Number(pageItem.id),
    };
  }, PNG_BASE64);
}

const invokeRender = () =>
  page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  });

test('T15: 渲染全套输出物（首页/文章/页面/分类/标签/归档/RSS/媒体）', async () => {
  const seeded = await seedRenderData();

  const report = (await invokeRender()) as {
    outputDir: string;
    files: number;
    baseUrl: string;
  };
  expect(report.files).toBeGreaterThan(8);

  const dist = path.join(siteDir, 'preview');

  // 首页：2 篇发布，草稿不在列表
  const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  expect(indexHtml).toContain('第一篇发布');
  expect(indexHtml).toContain('第二篇发布');
  expect(indexHtml).not.toContain('未发布的草稿');
  expect(indexHtml).toContain('测试站点');

  // 文章详情：含改写后的媒体 URL
  const postHtml = fs.readFileSync(
    path.join(dist, 'post', 'first-post.html'),
    'utf8'
  );
  expect(postHtml).toContain('第一篇内容');
  expect(postHtml).toContain('media/dot.png');
  expect(postHtml).not.toContain('wordma-media://');

  // 草稿详情页（预览模式 includeDrafts）存在
  expect(
    fs.existsSync(path.join(dist, 'post', 'draft-post.html'))
  ).toBe(true);

  // 独立页面
  const aboutHtml = fs.readFileSync(path.join(dist, 'about.html'), 'utf8');
  expect(aboutHtml).toContain('关于页面内容');

  // 分类/标签列表页
  expect(
    fs.existsSync(path.join(dist, 'category', seeded.categorySlug, 'index.html'))
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dist, 'tag', seeded.tagSlug, 'index.html'))
  ).toBe(true);

  // 分类/标签总览
  const catsHtml = fs.readFileSync(
    path.join(dist, 'categories', 'index.html'),
    'utf8'
  );
  expect(catsHtml).toContain('教程');
  const tagsHtml = fs.readFileSync(
    path.join(dist, 'tags', 'index.html'),
    'utf8'
  );
  expect(tagsHtml).toContain('随笔');

  // 归档按年分组
  const archiveHtml = fs.readFileSync(
    path.join(dist, 'archive', 'index.html'),
    'utf8'
  );
  expect(archiveHtml).toContain('第一篇发布');
  expect(archiveHtml).toMatch(new RegExp(new Date().getFullYear().toString()));

  // RSS：2 条 item
  const feed = fs.readFileSync(path.join(dist, 'feed.xml'), 'utf8');
  expect((feed.match(/<item>/g) ?? []).length).toBe(2);
  expect(feed).toContain('<![CDATA[');

  // assets + media 拷贝（站点媒体目录 → dist/media）
  expect(fs.existsSync(path.join(dist, 'assets', 'style.css'))).toBe(true);
  expect(
    fs.existsSync(path.join(dist, 'media', seeded.mediaFilename))
  ).toBe(true);
});

test('T15: slug 与页面路由冲突 → 渲染失败并报路径冲突', async () => {
  await seedRenderData();

  // 将 post 路由改为与 page 相同，并创建 slug 与页面相同的文章 → URL 撞车
  await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    const rules = (await api.invoke('get_routing_rules', {
      siteId: active.id,
    })) as Record<string, string>;
    await api.invoke('set_setting', {
      key: `routing_rules:${active.id}`,
      value: JSON.stringify({ ...rules, post: '/[slug].html' }),
    });
    await api.invoke('create_page', {
      siteId: active.id,
      title: '撞名页面',
      slug: 'first-post',
    });
  });

  await expect(invokeRender()).rejects.toThrow(/路径冲突/);
});



// 公式样式按需引入：正文用到公式才把 KaTeX 的 CSS 与字体拷进产物

const renderWithContent = async (content: string) => {
  await page.evaluate(async (html: string) => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    const articles = await api.invoke('list_articles', { siteId: active.id });
    await api.invoke('update_article', {
      id: articles[0].id,
      status: 'published',
      content: html,
    });
  }, content);

  return (await page.evaluate(async () => {
    const api = (window as any).api;
    const active = await api.invoke('get_active_site');
    return api.invoke('render_site', { siteId: active.id });
  })) as { outputDir: string };
};

test('T15: 正文不含公式时不引入 KaTeX 样式', async () => {
  const report = await renderWithContent('<p>普通正文</p>');

  expect(fs.existsSync(path.join(report.outputDir, 'assets', 'katex'))).toBe(false);
  const indexHtml = fs.readFileSync(path.join(report.outputDir, 'index.html'), 'utf8');
  expect(indexHtml).not.toContain('katex.min.css');
});

test('T15: 正文含公式时引入 KaTeX 样式与字体', async () => {
  const report = await renderWithContent(
    '<div class="slate-equation my-1"><span class="katex">E = mc^2</span></div>'
  );

  const cssPath = path.join(report.outputDir, 'assets', 'katex', 'katex.min.css');
  expect(fs.existsSync(cssPath)).toBe(true);
  // 字体按 katex/dist 的相对布局一起拷（CSS 里用 url(fonts/...) 引用）
  const fontsDir = path.join(report.outputDir, 'assets', 'katex', 'fonts');
  expect(fs.existsSync(fontsDir)).toBe(true);
  expect(fs.readdirSync(fontsDir).some((f) => f.endsWith('.woff2'))).toBe(true);

  const indexHtml = fs.readFileSync(path.join(report.outputDir, 'index.html'), 'utf8');
  expect(indexHtml).toContain('katex/katex.min.css');
});

test('T15: 导航里的分类/标签链接指向总览页（不是 [slug] 路由模板）', async () => {
  const seeded = await seedRenderData();
  await invokeRender();

  const dist = path.join(siteDir, 'preview');
  const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

  // 链接不能是详情页的路由模板字面量
  expect(indexHtml).not.toContain('[slug]');
  expect(indexHtml).toContain('href="/categories/"');
  expect(indexHtml).toContain('href="/tags/"');

  // 链接指向的总览页确实生成了
  expect(fs.existsSync(path.join(dist, 'categories', 'index.html'))).toBe(true);
  expect(fs.existsSync(path.join(dist, 'tags', 'index.html'))).toBe(true);

  // 总览页里指向具体分类/标签的链接是替换过 slug 的真实路径
  const categoriesHtml = fs.readFileSync(
    path.join(dist, 'categories', 'index.html'),
    'utf8'
  );
  expect(categoriesHtml).not.toContain('[slug]');
  expect(categoriesHtml).toContain('/category/');
});
