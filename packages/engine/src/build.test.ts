import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BuildError, buildSite } from './index';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const fixture = path.join(repoRoot, 'fixtures/content-layer');

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'wordma-build-'));
}

describe('buildSite', () => {
  it('输出完整 HTML 与 build manifest', async () => {
    const outDir = makeOutDir();

    try {
      writeFileSync(path.join(outDir, 'stale.txt'), 'old');

      const result = await buildSite({
        root: fixture,
        outDir,
      });

      expect(result.routes).toBe(17);
      expect(result.compiledEntries).toBe(4);
      expect(result.islands).toBe(0);
      expect(result.theme.id).toBe('wordma-theme-default');
      expect(result.diagnostics).toEqual([]);
      expect(existsSync(path.join(outDir, 'stale.txt'))).toBe(false);

      const files = [
        'index.html',
        'page/2/index.html',
        'posts/standalone-post/index.html',
        'posts/folder/index.html',
        'about/index.html',
        'projects/demo/index.html',
        'archive/index.html',
        'categories/index.html',
        'tags/index.html',
        'category/notes/index.html',
        'category/pages/index.html',
        'category/projects/index.html',
        'tag/alpha/index.html',
        'tag/beta/index.html',
        'tag/project/index.html',
        'tag/shared/index.html',
        '404.html',
        '.wordma-manifest.json',
      ];

      for (const file of files) {
        expect(existsSync(path.join(outDir, file))).toBe(true);
      }

      const home = readFileSync(
        path.join(outDir, 'index.html'),
        'utf8',
      );
      expect(home).toContain('Content Layer Fixture');
      expect(home).toContain('href="/posts/standalone-post/"');
      expect(home).toContain('href="/page/2/"');
      expect(home).toContain(
        '/assets/css/theme-',
      );
      expect(
        existsSync(path.join(outDir, 'assets/islands')),
      ).toBe(false);

      const themeCss = readdirSync(
        path.join(outDir, 'assets/css'),
      );
      expect(themeCss).toHaveLength(1);
      expect(themeCss[0]).toStartWith('theme-');

      const notFound = readFileSync(
        path.join(outDir, '404.html'),
        'utf8',
      );
      expect(notFound).toContain('<h1>404</h1>');

      const post = readFileSync(
        path.join(
          outDir,
          'posts/standalone-post/index.html',
        ),
        'utf8',
      );
      expect(post).toContain('Content layer fixture.');
      expect(post).toContain('id="standalone-post"');

      const manifest = JSON.parse(
        readFileSync(
          path.join(outDir, '.wordma-manifest.json'),
          'utf8',
        ),
      ) as {
        version: number;
        site: { title: string; basePath: string };
        theme: { id: string; version: string };
        routes: unknown[];
        diagnostics: unknown[];
        assets: {
          islands: unknown[];
          reactRuntime?: unknown;
          mountScript?: unknown;
        };
      };

      expect(manifest.version).toBe(1);
      expect(manifest.site.title).toBe('Content Layer Fixture');
      expect(manifest.site.basePath).toBe('');
      expect(manifest.theme.id).toBe('wordma-theme-default');
      expect(manifest.routes).toHaveLength(17);
      expect(manifest.diagnostics).toEqual([]);
      expect(manifest.assets.islands).toEqual([]);
      expect(manifest.assets.reactRuntime).toBeUndefined();
      expect(manifest.assets.mountScript).toBeUndefined();
      expect(home).not.toContain('type="importmap"');
      expect(home).not.toContain('data-wordma-src');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(fixture, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });

  it('includeDrafts 时输出草稿页面', async () => {
    const outDir = makeOutDir();

    try {
      const result = await buildSite({
        root: fixture,
        outDir,
        includeDrafts: true,
      });

      expect(result.routes).toBe(20);
      expect(result.compiledEntries).toBe(5);
      expect(
        existsSync(path.join(outDir, 'posts/draft/index.html')),
      ).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(fixture, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });

  it('构建时输出 MDX 正文与岛屿占位符', async () => {
    const root = path.join(repoRoot, 'fixtures/islands');
    const outDir = makeOutDir();

    try {
      const result = await buildSite({ root, outDir });

      expect(result.compiledEntries).toBe(1);
      expect(result.islands).toBe(2);

      const html = readFileSync(
        path.join(outDir, 'posts/islands/index.html'),
        'utf8',
      );

      expect(html).toContain('id="islands"');
      expect(html).toContain('data-wordma-island="Counter"');
      expect(html).toContain('data-wordma-island="Note"');
      expect(html).toContain(
        'This content is rendered inside a Note island.',
      );
      expect(html).toContain(
        'data-wordma-src="/assets/islands/island-',
      );
      expect(html).toContain('<link rel="stylesheet"');
      expect(html).toContain(
        'href="/assets/islands/island-',
      );
      expect(html).toContain('.css"');
      expect(html).toContain(
        '/assets/css/theme-',
      );
      expect(html.indexOf('/assets/css/theme-')).toBeLessThan(
        html.indexOf('/assets/islands/island-'),
      );
      expect(html).toContain('<script type="importmap">');
      expect(html).toContain(
        '"react":"/assets/islands/react-',
      );
      expect(html).toContain(
        '<script type="module" src="/assets/islands/mount-',
      );
      expect(html.indexOf('type="importmap"')).toBeLessThan(
        html.indexOf('type="module"'),
      );

      const islandFile = /data-wordma-src="\/assets\/islands\/(island-[^"]+\.js)"/.exec(
        html,
      )?.[1];
      expect(islandFile).toBeDefined();
      expect(
        existsSync(
          path.join(outDir, 'assets/islands', islandFile ?? ''),
        ),
      ).toBe(true);

      const assets = readdirSync(
        path.join(outDir, 'assets/islands'),
      );
      expect(
        assets.filter((file) => file.startsWith('react-')),
      ).toHaveLength(1);
      expect(
        assets.filter((file) => file.startsWith('mount-')),
      ).toHaveLength(1);
      expect(
        assets.filter(
          (file) =>
            file.startsWith('island-') &&
            file.endsWith('.js'),
        ),
      ).toHaveLength(2);
      expect(
        assets.filter((file) => file.endsWith('.css')),
      ).toHaveLength(1);

      const home = readFileSync(
        path.join(outDir, 'index.html'),
        'utf8',
      );
      expect(home).not.toContain('type="importmap"');
      expect(home).not.toContain('data-wordma-src');

      const manifest = JSON.parse(
        readFileSync(
          path.join(outDir, '.wordma-manifest.json'),
          'utf8',
        ),
      ) as {
        assets: {
          islands: Array<{
            source: string;
            exportName: string;
            js: string;
            css?: string;
            bytes: number;
          }>;
          reactRuntime?: { url: string; bytes: number };
          mountScript?: { url: string; bytes: number };
        };
      };

      expect(manifest.assets.islands).toHaveLength(2);
      expect(manifest.assets.islands[0]).toMatchObject({
        source: 'components/counter.tsx',
        exportName: 'default',
      });
      expect(manifest.assets.islands[0]?.js).toContain(
        '/assets/islands/island-',
      );
      expect(
        manifest.assets.islands.some((item) =>
          item.css?.endsWith('.css'),
        ),
      ).toBe(true);
      expect(
        manifest.assets.islands.every(
          (item) => item.bytes > 0,
        ),
      ).toBe(true);
      expect(manifest.assets.reactRuntime?.url).toContain(
        '/assets/islands/react-',
      );
      expect(
        manifest.assets.reactRuntime?.bytes,
      ).toBeGreaterThan(0);
      expect(manifest.assets.mountScript?.url).toContain(
        '/assets/islands/mount-',
      );
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(root, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });

  it('主题缺失 archive/taxonomy 的诊断进入 build manifest', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-fallback-ws-'),
    );
    const outDir = makeOutDir();
    const themeId = 'wordma-theme-fallback-build';
    const themeDir = path.join(root, 'themes', themeId);

    try {
      mkdirSync(path.join(root, 'content/posts'), {
        recursive: true,
      });
      mkdirSync(path.join(themeDir, 'src'), { recursive: true });

      writeFileSync(
        path.join(root, 'wordma.site.yaml'),
        [
          'site:',
          '  title: Fallback Build',
          'theme:',
          `  id: ${themeId}`,
        ].join('\n'),
      );
      writeFileSync(
        path.join(root, 'content/posts/hello.mdx'),
        '---\ntitle: Hello\ndate: 2026-01-01\n---\nBody\n',
      );
      writeFileSync(
        path.join(themeDir, 'theme.yaml'),
        [
          `id: ${themeId}`,
          'displayName: Fallback',
          'version: 0.0.0',
          'engines:',
          '  wordma: ">=0.0.0"',
          'settings: []',
          'pages: []',
        ].join('\n'),
      );
      writeFileSync(
        path.join(themeDir, 'package.json'),
        JSON.stringify({
          name: themeId,
          version: '0.0.0',
          type: 'module',
          exports: {
            '.': './src/index.tsx',
          },
        }),
      );
      writeFileSync(
        path.join(themeDir, 'src/index.tsx'),
        [
          'const Layout = () => null;',
          'export default {',
          '  layouts: {',
          '    root: Layout,',
          '    index: Layout,',
          '    post: Layout,',
          '    page: Layout,',
          '    notFound: Layout,',
          '  },',
          '};',
        ].join('\n'),
      );

      const result = await buildSite({ root, outDir });
      const warnings = result.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'MISSING_LAYOUT',
      );

      expect(warnings).toHaveLength(2);

      const manifest = JSON.parse(
        readFileSync(
          path.join(outDir, '.wordma-manifest.json'),
          'utf8',
        ),
      ) as {
        diagnostics: Array<{ code: string }>;
      };

      expect(
        manifest.diagnostics.filter(
          (diagnostic) => diagnostic.code === 'MISSING_LAYOUT',
        ),
      ).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('拒绝工作区或其父目录作为输出目录', async () => {
    try {
      await buildSite({
        root: fixture,
        outDir: fixture,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BuildError);
      expect((error as BuildError).code).toBe('UNSAFE_OUT_DIR');
      return;
    }

    throw new Error('预期抛出 BuildError(UNSAFE_OUT_DIR)');
  });
});
