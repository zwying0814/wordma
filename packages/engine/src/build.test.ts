import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
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

      const notFound = readFileSync(
        path.join(outDir, '404.html'),
        'utf8',
      );
      expect(notFound).toContain('<h1>404</h1>');

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
      };

      expect(manifest.version).toBe(1);
      expect(manifest.site.title).toBe('Content Layer Fixture');
      expect(manifest.site.basePath).toBe('');
      expect(manifest.theme.id).toBe('wordma-theme-default');
      expect(manifest.routes).toHaveLength(17);
      expect(manifest.diagnostics).toEqual([]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
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
      expect(
        existsSync(path.join(outDir, 'posts/draft/index.html')),
      ).toBe(true);
    } finally {
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
