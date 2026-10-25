import { describe, expect, it } from 'bun:test';

import type {
  AssetRef,
  PageMeta,
  SiteMeta,
} from '@wordma/content';

import type { Route } from '../routing/manifest';
import { buildSeo } from './seo';

const site: SiteMeta = {
  title: 'Site',
  description: 'Site description',
  url: 'https://example.com',
  language: 'zh-CN',
  basePath: '/docs',
};

const page: PageMeta = {
  id: 'posts/hello',
  kind: 'post',
  title: 'Hello',
  slug: 'hello',
  description: 'Page description',
  tags: [],
  categories: [],
  draft: false,
  data: {},
};

const route: Route = {
  path: '/posts/hello/',
  output: 'posts/hello/index.html',
  kind: 'post',
  layout: 'post',
  entryId: 'posts/hello',
};

const cover: AssetRef = {
  source: 'content/posts/hello/cover.png',
  url: '/docs/assets/content/abcd1234-cover.png',
  hash: 'abcd1234',
  bytes: 10,
};

describe('buildSeo', () => {
  it('生成文章 SEO 与绝对 canonical/OG image', () => {
    const seo = buildSeo({
      site,
      route,
      page,
      excerpt: 'Excerpt',
      cover,
    });

    expect(seo.title).toBe('Hello · Site');
    expect(seo.description).toBe('Page description');
    expect(seo.canonical).toBe(
      'https://example.com/docs/posts/hello/',
    );
    expect(seo.openGraph).toEqual({
      title: 'Hello · Site',
      description: 'Page description',
      type: 'article',
      url: 'https://example.com/docs/posts/hello/',
      image:
        'https://example.com/docs/assets/content/abcd1234-cover.png',
      siteName: 'Site',
      locale: 'zh-CN',
    });
    expect(seo.twitter).toEqual({
      card: 'summary_large_image',
      title: 'Hello · Site',
      description: 'Page description',
      image:
        'https://example.com/docs/assets/content/abcd1234-cover.png',
    });
  });

  it('description 回退到 excerpt', () => {
    const seo = buildSeo({
      site,
      route,
      page: { ...page, description: undefined },
      excerpt: 'Excerpt',
    });

    expect(seo.description).toBe('Excerpt');
    expect(seo.openGraph.description).toBe('Excerpt');
    expect(seo.twitter.card).toBe('summary');
  });

  it('无 site.url 时省略绝对 URL 字段', () => {
    const seo = buildSeo({
      site: {
        ...site,
        url: undefined,
      },
      route,
      page,
      cover,
    });

    expect(seo.canonical).toBeUndefined();
    expect(seo.openGraph.url).toBeUndefined();
    expect(seo.openGraph.image).toBeUndefined();
    expect(seo.twitter.image).toBeUndefined();
    expect(seo.twitter.card).toBe('summary');
  });

  it('首页标题不重复站点名，类型为 website', () => {
    const seo = buildSeo({
      site: {
        ...site,
        description: 'Site description',
      },
      route: {
        path: '/',
        output: 'index.html',
        kind: 'index',
        layout: 'index',
      },
      page: {
        id: 'route:/',
        kind: 'page',
        title: 'Site',
        slug: 'index',
        tags: [],
        categories: [],
        draft: false,
        data: {},
      },
    });

    expect(seo.title).toBe('Site');
    expect(seo.description).toBe('Site description');
    expect(seo.canonical).toBe('https://example.com/docs/');
    expect(seo.openGraph.type).toBe('website');
    expect(seo.twitter.card).toBe('summary');
  });
});
