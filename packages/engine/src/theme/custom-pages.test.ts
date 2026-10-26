import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildSite } from '../build';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);

describe('custom pages build', () => {
  it('构建 pageTypes 与主题静态页', async () => {
    const root = path.join(repoRoot, 'fixtures/custom-pages');
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-custom-pages-'),
    );

    try {
      const result = await buildSite({ root, outDir });

      expect(
        result.diagnostics.filter(
          (item) =>
            item.code !== 'MISSING_SITE_URL' &&
            item.code !== 'UNKNOWN_THEME_FIELD',
        ),
      ).toEqual([]);

      const files = [
        'about/index.html',
        'projects/demo/index.html',
        'search/index.html',
        '404.html',
      ];

      for (const file of files) {
        expect(existsSync(path.join(outDir, file))).toBe(
          true,
        );
      }

      const about = readFileSync(
        path.join(outDir, 'about/index.html'),
        'utf8',
      );
      expect(about).toContain('About');

      const project = readFileSync(
        path.join(outDir, 'projects/demo/index.html'),
        'utf8',
      );
      expect(project).toContain('Demo Project');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(root, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });
});
