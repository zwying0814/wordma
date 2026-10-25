import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Window } from 'happy-dom';

import { loadWorkspace } from '@wordma/content';

import type { Route } from '../routing/manifest';
import { writeFeeds } from './feeds';

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function parseXml(source: string): Document {
  const window = new Window();
  return new window.DOMParser().parseFromString(
    source,
    'application/xml',
  ) as unknown as Document;
}

const routes: Route[] = [
  {
    path: '/',
    output: 'index.html',
    kind: 'index',
    layout: 'index',
  },
  {
    path: '/posts/a/',
    output: 'posts/a/index.html',
    kind: 'post',
    layout: 'post',
    entryId: 'posts/a',
  },
  {
    path: '/posts/b/',
    output: 'posts/b/index.html',
    kind: 'post',
    layout: 'post',
    entryId: 'posts/b',
  },
  {
    path: '/about/',
    output: 'about/index.html',
    kind: 'page',
    layout: 'page',
    entryId: 'pages/about',
  },
  {
    path: '/404/',
    output: '404.html',
    kind: 'not-found',
    layout: 'notFound',
  },
];

describe('writeFeeds', () => {
  it('生成 RSS、sitemap、robots 并排除 404', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-feeds-'),
    );
    const outDir = path.join(root, 'dist');

    try {
      writeFile(
        root,
        'wordma.site.yaml',
        [
          'site:',
          '  title: Feeds Site',
          '  description: Site description',
          '  url: https://example.com',
          '  basePath: /docs',
          'theme:',
          '  id: wordma-theme-default',
        ].join('\n'),
      );
      writeFile(
        root,
        'content/posts/a.mdx',
        [
          '---',
          'title: A & B',
          'date: 2026-10-25',
          'description: "Desc <x>"',
          '---',
          'Body A',
        ].join('\n'),
      );
      writeFile(
        root,
        'content/posts/b.mdx',
        [
          '---',
          'title: Post B',
          'date: 2026-10-24',
          '---',
          'Body B',
        ].join('\n'),
      );
      writeFile(
        root,
        'content/pages/about.mdx',
        '---\ntitle: About\n---\nAbout',
      );
      mkdirSync(outDir, { recursive: true });

      const workspace = loadWorkspace(root);
      const entriesById = new Map(
        workspace.index.entries.map((entry) => [
          entry.id,
          entry,
        ]),
      );
      const result = writeFeeds({
        site: workspace.site.site,
        routes,
        posts:
          workspace.index.collections.posts?.entries ?? [],
        entriesById,
        excerpts: new Map([['posts/b', 'Excerpt B']]),
        outDir,
      });

      expect(result.files.map((file) => file.path)).toEqual([
        'rss.xml',
        'sitemap.xml',
        'robots.txt',
      ]);

      const rss = parseXml(
        readFileSync(path.join(outDir, 'rss.xml'), 'utf8'),
      );
      const items = [
        ...rss.querySelectorAll('item'),
      ];

      expect(items).toHaveLength(2);
      expect(
        items[0]?.querySelector('title')?.textContent,
      ).toBe('A & B');
      expect(
        items[0]?.querySelector('link')?.textContent,
      ).toBe('https://example.com/docs/posts/a/');
      expect(
        items[0]?.querySelector('description')?.textContent,
      ).toBe('Desc <x>');
      expect(
        items[1]?.querySelector('description')?.textContent,
      ).toBe('Excerpt B');
      expect(
        items[0]?.querySelector('pubDate')?.textContent,
      ).toContain('GMT');
      expect(
        rss.querySelector('lastBuildDate')?.textContent,
      ).toContain('GMT');
      expect(
        rss.querySelector('channel > link')?.textContent,
      ).toBe('https://example.com/docs/');

      const sitemap = parseXml(
        readFileSync(
          path.join(outDir, 'sitemap.xml'),
          'utf8',
        ),
      );
      const locations = [
        ...sitemap.querySelectorAll('loc'),
      ].map((node) => node.textContent);

      expect(locations).toHaveLength(4);
      expect(locations).toContain(
        'https://example.com/docs/posts/a/',
      );
      expect(locations).toContain(
        'https://example.com/docs/about/',
      );
      expect(
        locations.some((url) => url?.includes('/404/')),
      ).toBe(false);
      expect(
        [...sitemap.querySelectorAll('url')][1]
          ?.querySelector('lastmod')
          ?.textContent,
      ).toBe('2026-10-25');

      const robots = readFileSync(
        path.join(outDir, 'robots.txt'),
        'utf8',
      );
      expect(robots).toContain('User-agent: *');
      expect(robots).toContain('Allow: /');
      expect(robots).toContain(
        'Sitemap: https://example.com/docs/sitemap.xml',
      );
      expect(result.diagnostics).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('无 site.url 时跳过 RSS/sitemap 并告警', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-feeds-'),
    );
    const outDir = path.join(root, 'dist');

    try {
      writeFile(
        root,
        'wordma.site.yaml',
        [
          'site:',
          '  title: No URL',
          'theme:',
          '  id: wordma-theme-default',
        ].join('\n'),
      );
      writeFile(
        root,
        'content/posts/a.mdx',
        '---\ntitle: A\ndate: 2026-10-25\n---\nBody',
      );
      mkdirSync(outDir, { recursive: true });

      const workspace = loadWorkspace(root);
      const result = writeFeeds({
        site: workspace.site.site,
        routes,
        posts:
          workspace.index.collections.posts?.entries ?? [],
        entriesById: new Map(
          workspace.index.entries.map((entry) => [
            entry.id,
            entry,
          ]),
        ),
        outDir,
      });

      expect(result.rss).toBeUndefined();
      expect(result.sitemap).toBeUndefined();
      expect(result.files.map((file) => file.path)).toEqual([
        'robots.txt',
      ]);
      expect(
        readFileSync(
          path.join(outDir, 'robots.txt'),
          'utf8',
        ),
      ).not.toContain('Sitemap:');
      expect(
        result.diagnostics.some(
          (item) => item.code === 'MISSING_SITE_URL',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('生成文件覆盖静态文件时告警', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-feeds-'),
    );
    const outDir = path.join(root, 'dist');

    try {
      writeFile(
        root,
        'wordma.site.yaml',
        [
          'site:',
          '  title: Static Conflict',
          '  url: https://example.com',
          'theme:',
          '  id: wordma-theme-default',
        ].join('\n'),
      );
      mkdirSync(path.join(root, 'content'), {
        recursive: true,
      });
      mkdirSync(outDir, { recursive: true });

      const workspace = loadWorkspace(root);
      const result = writeFeeds({
        site: workspace.site.site,
        routes,
        posts: [],
        entriesById: new Map(),
        outDir,
        staticPaths: new Set(['robots.txt']),
      });

      expect(
        result.diagnostics.filter(
          (item) => item.code === 'STATIC_CONFLICT',
        ),
      ).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
