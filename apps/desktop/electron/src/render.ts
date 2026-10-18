import ejs from 'ejs';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { listArticles } from './article';
import { getDataDir } from './db';
import { generatePath, getRoutingRules } from './routing';
import { getCurrentSiteId, getSite, type Site } from './site';
import { listPages } from './pages';
import { listCategories, listTags } from './taxonomy';
import { getPreviewPort } from './preview';
import { getActiveThemeName, resolveThemeSettings, themesDir } from './theme';
import {
  ARCHIVE_TEMPLATE,
  BASE_TEMPLATE,
  INDEX_TEMPLATE,
  PAGE_TEMPLATE,
  POST_TEMPLATE,
  STYLE_CSS,
  TAXONOMIES_TEMPLATE,
} from './templates';

export type RenderReport = {
  siteId: number;
  outputDir: string;
  files: number;
  baseUrl: string;
};

type PostRef = { id: number; name: string };

type PostView = {
  id: number;
  title: string;
  /** 模板里用的站内链接（含站点子目录前缀） */
  url: string;
  /** 站点根相对路径（写文件、RSS 用，不含前缀） */
  path: string;
  date: string;
  status: 'draft' | 'published';
  contentHtml: string;
  categories: PostRef[];
  tags: PostRef[];
  categoriesText: string;
  tagsText: string;
  wordCount: number;
};

const POSTS_PER_PAGE = 10;

/** 分类/标签总览页路径（路由规则里没有总览页的键，与 Rust 版一致固定为这两个） */
const CATEGORIES_URL = '/categories/';
const TAGS_URL = '/tags/';

/** 正文里是否用到了公式（保存下来的 HTML 里带 slate-equation / slate-inline_equation 类名） */
function containsEquation(html: string): boolean {
  return /slate-(inline_)?equation/.test(html);
}

/**
 * 把 KaTeX 的样式与字体拷进产物（仅在用到公式时调用）。
 * CSS 里用相对路径引用 fonts/，所以两者要按 katex/dist 的布局一起拷。
 */
function copyKatexAssets(outputDir: string): void {
  // 用 esbuild banner 注入的 require（打包产物里它已按 import.meta.url 建好）
  const cssPath = require.resolve('katex/dist/katex.min.css');
  const katexDist = path.dirname(cssPath);
  const targetDir = path.join(outputDir, 'assets', 'katex');

  mkdirSync(targetDir, { recursive: true });
  cpSync(cssPath, path.join(targetDir, 'katex.min.css'));
  cpSync(path.join(katexDist, 'fonts'), path.join(targetDir, 'fonts'), {
    recursive: true,
  });
}

/** 站点地址里的子目录前缀（如 https://user.github.io/repo/ → '/repo/'；域名根目录 → '/'） */
function basePathOf(baseUrl: string): string {
  try {
    const { pathname } = new URL(baseUrl);
    if (!pathname || pathname === '/') return '/';
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  } catch {
    return '/';
  }
}

/**
 * 站内链接统一加站点子目录前缀。
 * 文件仍写在站点根相对位置（写文件、RSS 用不带前缀的 path），只有链接带前缀，
 * 这样部署到子目录（如 GitHub Pages 项目页）时页面之间才点得通。
 */
function withBase(path: string, basePath: string): string {
  return `${basePath}${path.replace(/^\//, '')}`;
}

/** 主题设置里的数值（宽松：非法回退默认值） */
function toPositiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) && num >= 1
    ? Math.floor(num)
    : fallback;
}
const FOOTER_TEXT = '由 Wordma 驱动';

/** 预览/构建共用入口：渲染站点到 outputDir */
export async function renderSiteTo(options: {
  site: Site;
  siteId: number;
  outputDir: string;
  includeDrafts: boolean;
  baseUrl: string;
}): Promise<RenderReport> {
  const { site, siteId, outputDir, includeDrafts, baseUrl } = options;
  const basePath = basePathOf(baseUrl);

  const rules = getRoutingRules(getCurrentSiteId());
  const articles = listArticles();
  const pages = listPages();
  const tags = listTags();
  const categories = listCategories();

  // 0) 激活主题（模板与 assets 优先于内置布局）
  const themeName = getActiveThemeName(siteId);
  const themeDir = path.join(themesDir(), themeName);
  const hasTheme = themeName !== 'default' && existsSync(path.join(themeDir, 'theme.yaml'));

  // 主题设置解析（宽松：坏值回退 schema 默认）
  const themeSettingsMap = resolveThemeSettings(themeName, siteId);

  // 1) 清空输出目录
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  // 2) 数据准备
  // 列表/归档/RSS 永远只含已发布；includeDrafts 仅控制草稿详情页是否生成（预览语义）
  const detailArticles = includeDrafts ? articles : articles.filter(
    (a) => a.status === 'published'
  );
  const listArticles_ = articles.filter((a) => a.status === 'published');
  const mediaPrefix = `wordma-media://media/${siteId}/`;
  const mediaReplacement = `${baseUrl}media/`;

  const postViews: PostView[] = detailArticles.map((a) => {
    const path = generatePath(rules.post, {
      slug: a.slug,
      id: String(a.id),
      year: a.createdAt.slice(0, 4),
      month: a.createdAt.slice(5, 7),
      day: a.createdAt.slice(8, 10),
    });

    return {
      id: a.id,
      title: a.title,
      url: withBase(path, basePath),
      path,
      date: a.createdAt.slice(0, 10),
      status: a.status,
      contentHtml: a.content.replaceAll(mediaPrefix, mediaReplacement),
      categories: a.categories,
      tags: a.tags,
      categoriesText: a.categories.map((c) => c.name).join('、'),
      tagsText: a.tags.map((t) => t.name).join('、'),
      wordCount: countWords(a.content),
    };
  });

  // 3) URL 冲突检测（全站唯一）
  const urlOwners = new Map<string, string>();
  const claim = (url: string, label: string): void => {
    const owner = urlOwners.get(url);
    if (owner !== undefined) {
      throw new Error(`路径冲突: ${url}（${owner} 与 ${label}）`);
    }
    urlOwners.set(url, label);
  };

  const pageUrls = new Map<number, string>();
  const categoryUrls = new Map<number, string>();
  const tagUrls = new Map<number, string>();
  const archiveUrl = rules.archive;
  const feedUrl = rules.feed;

  for (const view of postViews) {
    claim(view.url, `文章「${view.title}」`);
  }
  for (const page of pages) {
    const url = generatePath(rules.page, { slug: page.slug, id: String(page.id) });
    claim(url, `页面「${page.title}」`);
    pageUrls.set(page.id, url);
  }
  for (const category of categories) {
    const url = generatePath(rules.category, {
      slug: taxonomySlug(category.name, category.id),
      id: String(category.id),
    });
    claim(url, `分类「${category.name}」`);
    categoryUrls.set(category.id, url);
  }
  for (const tag of tags) {
    const url = generatePath(rules.tag, {
      slug: taxonomySlug(tag.name, tag.id),
      id: String(tag.id),
    });
    claim(url, `标签「${tag.name}」`);
    tagUrls.set(tag.id, url);
  }
  claim(archiveUrl, '归档');
  claim(rules.category, '分类总览');
  claim(rules.tag, '标签总览');
  claim(feedUrl, 'RSS');

  // 4) 渲染上下文
  const navPages = pages
    .filter((p) => p.showInNav)
    .map((p) => ({
      title: p.title,
      url: withBase(pageUrls.get(p.id) ?? '/', basePath),
    }));

  // 主题模板加载：激活主题 templates/*.ejs 优先，缺失回退内置布局
  const themeTemplates: Record<string, string> = {};
  if (hasTheme) {
    const tplDir = path.join(themeDir, 'templates');
    if (existsSync(tplDir)) {
      for (const file of readdirSync(tplDir)) {
        if (file.endsWith('.ejs')) {
          themeTemplates[file] = readFileSync(path.join(tplDir, file), 'utf8');
        }
      }
    }
  }
  const tpl = (name: string, fallback: string): string =>
    themeTemplates[`${name}.ejs`] ?? fallback;

  // 主题设置注入模板上下文（宽松解析：坏值已在 resolveThemeSettings 里回退 schema 默认）
  const themeContext: Record<string, unknown> = { ...themeSettingsMap };
  themeContext.footerText = themeSettingsMap.footerText ?? FOOTER_TEXT;
  const perPage = toPositiveInt(themeSettingsMap.postsPerPage, POSTS_PER_PAGE);
  themeContext.postsPerPage = perPage;

  const files: string[] = [];
  const baseContext = {
    site: { name: site.name, description: site.description ?? '', url: baseUrl },
    urls: {
      archive: withBase(archiveUrl, basePath),
      // 注意：这里要的是「总览页」地址；rules.category/rules.tag 是详情页的
      // 路由模板（形如 /category/[slug]/），直接当链接用会 404
      categories: withBase(CATEGORIES_URL, basePath),
      tags: withBase(TAGS_URL, basePath),
      feed: withBase(feedUrl, basePath),
    },
    navPages,
    theme: themeContext,
    footerText: String(themeContext.footerText),
    assetRoot: baseUrl,
    title: site.name,
    body: '',
  };

  // 用到公式才引入 KaTeX 样式（否则产物里多 1MB 字体）
  const usesEquation =
    postViews.some((view) => containsEquation(view.contentHtml)) ||
    pages.some((page) => containsEquation(page.content));
  const katexLink = usesEquation
    ? `<link rel="stylesheet" href="${baseUrl}assets/katex/katex.min.css">`
    : '';

  // base 壳：主题 base.ejs 优先
  const baseTpl = themeTemplates['base.ejs'] ?? BASE_TEMPLATE;
  const renderShell = (bodyHtml: string, title: string): string => {
    const html = ejs.render(baseTpl, {
      ...baseContext,
      body: bodyHtml,
      title: `${title} - ${site.name}`,
    });

    // 主题模板可能没有 </head>，兜底插到最前面
    if (!katexLink) return html;
    return html.includes('</head>')
      ? html.replace('</head>', `${katexLink}</head>`)
      : katexLink + html;
  };

  const writePage = (url: string, bodyHtml: string, title: string): void => {
    const html = renderShell(bodyHtml, title);
    const relative = url === '/' ? 'index.html' : toRelativeFile(url);
    const filePath = path.join(outputDir, relative);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, html);
    files.push(relative);
  };


  // 5) 文章详情页
  const postTpl = tpl('post', POST_TEMPLATE);
  for (const view of postViews) {
    const body = ejs.render(postTpl, { post: view });
    writePage(view.path, body, view.title);
  }

  // 6) 独立页面
  const pageTpl = tpl('page', PAGE_TEMPLATE);
  for (const page of pages) {
    const body = ejs.render(pageTpl, {
      page: { title: page.title, contentHtml: page.content },
    });
    writePage(pageUrls.get(page.id) ?? '/', body, page.title);
  }

  // 7) 首页分页 + 分类/标签列表页（复用 index 模板；仅已发布）
  const publishedViews = postViews.filter((p) => p.status === 'published');
  const publishedSorted = [...publishedViews].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id
  );
  const totalPages = Math.max(
    1,
    Math.ceil(publishedSorted.length / perPage)
  );
  const indexPaginationUrl = (page: number): string =>
    page <= 1 ? '/' : generatePath(rules.indexPagination, { num: String(page) });

  const indexTpl = tpl('index', INDEX_TEMPLATE);
  const renderIndex = (
    posts: PostView[],
    page: number,
    taxonomy?: { kind: string; name: string }
  ): void => {
    const body = ejs.render(indexTpl, {
      posts,
      pagination: {
        current: page,
        total: totalPages,
        prevUrl: page > 1 ? withBase(indexPaginationUrl(page - 1), basePath) : null,
        nextUrl:
          page < totalPages
            ? withBase(indexPaginationUrl(page + 1), basePath)
            : null,
      },
      taxonomy,
    });
    writePage(indexPaginationUrl(page), body, site.name);
  };

  for (let page = 1; page <= totalPages; page += 1) {
    const start = (page - 1) * perPage;
    renderIndex(publishedSorted.slice(start, start + perPage), page);
  }

  // 分类/标签列表页（各自全量文章）
  const categoryViews = categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: listArticles_.filter((a) => a.categories.some((r) => r.id === c.id)).length,
  }));
  const tagViews = tags.map((t) => ({
    id: t.id,
    name: t.name,
    count: listArticles_.filter((a) => a.tags.some((r) => r.id === t.id)).length,
  }));

  for (const category of categories) {
    const posts = publishedViews.filter((view) =>
      view.categories.some((r) => r.id === category.id)
    );
    const body = ejs.render(indexTpl, {
      posts,
      pagination: { current: 1, total: 1, prevUrl: null, nextUrl: null },
      taxonomy: { kind: 'category', name: category.name },
    });
    writePage(categoryUrls.get(category.id) ?? '/', body, `分类：${category.name}`);
  }
  for (const tag of tags) {
    const posts = publishedViews.filter((view) =>
      view.tags.some((r) => r.id === tag.id)
    );
    const body = ejs.render(indexTpl, {
      posts,
      pagination: { current: 1, total: 1, prevUrl: null, nextUrl: null },
      taxonomy: { kind: 'tag', name: tag.name },
    });
    writePage(tagUrls.get(tag.id) ?? '/', body, `标签：${tag.name}`);
  }

  // 8) 归档（按创建年份分组，倒序）
  const archiveTpl = tpl('archive', ARCHIVE_TEMPLATE);
  const archiveBody = ejs.render(archiveTpl, {
    groups: groupByYear(publishedSorted),
  });
  writePage(archiveUrl, archiveBody, '归档');

  // 9) 分类/标签总览
  const taxonomiesTpl = tpl('taxonomies', TAXONOMIES_TEMPLATE);
  const taxonomiesBody = ejs.render(taxonomiesTpl, {
    heading: '分类',
    items: categoryViews.map((c) => ({
      name: c.name,
      url: withBase(categoryUrls.get(c.id) ?? '/', basePath),
      count: c.count,
    })),
  });
  writePage(CATEGORIES_URL, taxonomiesBody, `分类 - ${site.name}`);

  const tagOverviewBody = ejs.render(taxonomiesTpl, {
    heading: '标签',
    items: tagViews.map((t) => ({
      name: t.name,
      url: withBase(tagUrls.get(t.id) ?? '/', basePath),
      count: t.count,
    })),
  });
  writePage(TAGS_URL, tagOverviewBody, `标签 - ${site.name}`);

  writeFileSync(path.join(outputDir, toRelativeFile(feedUrl)), buildRss(site, publishedSorted, baseUrl));
  files.push(toRelativeFile(feedUrl));

  // 11) assets（主题 assets/ 优先）+ media 拷贝
  const assetsDir = path.join(outputDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const themeAssets = path.join(themeDir, 'assets');
  if (hasTheme && existsSync(themeAssets)) {
    cpSync(themeAssets, assetsDir, { recursive: true });
  } else {
    writeFileSync(path.join(assetsDir, 'style.css'), STYLE_CSS);
  }
  if (usesEquation) {
    copyKatexAssets(outputDir);
  }
  files.push('assets/');

  // 站点目录模型：media/ 直接挂在站点目录下（wordma-media:// URL 里的 siteId 只是兼容形式）
  const mediaSrc = path.join(getDataDir(), 'media');
  if (existsSync(mediaSrc)) {
    cpSync(mediaSrc, path.join(outputDir, 'media'), { recursive: true });
    files.push('media/');
  }

  return { siteId, outputDir, files: files.length, baseUrl };
}

/** 渲染站点预览（含草稿，输出到 preview/{siteId}，baseUrl 指向预览服务器） */
export async function renderSitePreview(siteId: number): Promise<RenderReport> {
  const site = getSite(siteId);
  const port = getPreviewPort();
  return renderSiteTo({
    site,
    siteId,
    outputDir: path.join(getDataDir(), 'preview'),
    includeDrafts: true,
    baseUrl: `http://127.0.0.1:${port}/`,
  });
}

function groupByYear(posts: PostView[]): {
  year: string;
  posts: { title: string; url: string; date: string }[];
}[] {
  const groups = new Map<string, PostView[]>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    const list = groups.get(year) ?? [];
    list.push(post);
    groups.set(year, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, list]) => ({
      year,
      posts: list.map((p) => ({ title: p.title, url: p.url, date: p.date })),
    }));
}

function countWords(content: string): number {
  return content.replace(/\s/g, '').length;
}

/** 分类/标签无 slug 列：名称 slugify，中文等字符回退 c-{id} */
function taxonomySlug(name: string, id: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `c-${id}`;
}

function toRelativeFile(url: string): string {
  const clean = url.replace(/^\//, '');
  if (clean === '' || clean.endsWith('/')) return `${clean}index.html`;
  return clean;
}

function buildRss(site: Site, posts: PostView[], baseUrl: string): string {
  const escape = (text: string): string =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  const items = posts
    .map(
      (post) => `    <item>
      <title>${escape(post.title)}</title>
      <link>${escape(baseUrl.replace(/\/$/, '') + post.path)}</link>
      <guid isPermaLink="true">${escape(baseUrl.replace(/\/$/, '') + post.path)}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description><![CDATA[${post.contentHtml}]]></description>
    </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escape(site.name)}</title>
    <link>${escape(baseUrl)}</link>
    <description>${escape(site.description ?? '')}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
