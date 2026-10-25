import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildSite } from '../build';

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

describe('basePath 构建', () => {
  it('样式、内容资源、主题链接与 404 都带 basePath', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-base-path-'),
    );
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-base-path-out-'),
    );

    try {
      writeFile(
        root,
        'wordma.site.yaml',
        [
          'site:',
          '  title: Base Path',
          '  basePath: /docs',
          'theme:',
          '  id: wordma-theme-default',
        ].join('\n'),
      );
      writeFile(
        root,
        'content/posts/hello.mdx',
        [
          '---',
          'title: Hello',
          'date: 2026-10-25',
          '---',
          '# Hello',
          '',
          '![pic](./pic.png)',
        ].join('\n'),
      );
      writeFile(root, 'content/posts/pic.png', 'png');
      writeFile(root, 'public/favicon.svg', 'icon');

      await buildSite({ root, outDir });

      const post = readFileSync(
        path.join(outDir, 'posts/hello/index.html'),
        'utf8',
      );

      expect(post).toContain(
        'href="/docs/assets/css/theme-',
      );
      expect(post).toMatch(
        /src="\/docs\/assets\/content\/[a-f0-9]{8}-pic\.png"/,
      );
      expect(post).toContain('href="/docs/"');

      const notFound = readFileSync(
        path.join(outDir, '404.html'),
        'utf8',
      );
      expect(notFound).toContain('href="/docs/"');

      expect(
        existsSync(path.join(outDir, 'favicon.svg')),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
