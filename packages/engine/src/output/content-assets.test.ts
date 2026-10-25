import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadWorkspace } from '@wordma/content';

import {
  copyContentAssets,
  createContentAssetResolver,
} from './content-assets';

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

describe('copyContentAssets', () => {
  it('复制内容资源并生成 hash URL', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-content-assets-'),
    );
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-content-assets-out-'),
    );

    try {
      writeFile(
        root,
        'wordma.site.yaml',
        [
          'site:',
          '  title: Assets',
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
          '---',
          '![pic](./pic.png)',
          '[doc](./doc.pdf)',
        ].join('\n'),
      );
      writeFile(root, 'content/posts/pic.png', 'png');
      writeFile(root, 'content/posts/doc.pdf', 'pdf');

      const workspace = loadWorkspace(root);
      const entry = workspace.index.entries[0];
      if (!entry) throw new Error('缺少 entry');

      const result = copyContentAssets({
        workspaceRoot: root,
        outDir,
        basePath: '/docs/',
        entries: [entry],
      });

      expect(result.assets).toHaveLength(2);
      for (const asset of result.assets) {
        expect(asset.hash).toMatch(/^[a-f0-9]{8}$/);
        expect(asset.url).toMatch(
          new RegExp(
            `^/docs/assets/content/${asset.hash}-(doc\\.pdf|pic\\.png)$`,
          ),
        );
        expect(
          existsSync(
            path.join(
              outDir,
              asset.url.replace('/docs/', ''),
            ),
          ),
        ).toBe(true);
      }

      const resolver = createContentAssetResolver({
        entryFilePath: entry.filePath,
        workspaceRoot: root,
        byRealPath: result.byRealPath,
      });
      const pic = result.assets.find((asset) =>
        asset.source.endsWith('pic.png'),
      );

      expect(resolver('./pic.png?size=2#top')).toBe(
        `${pic?.url}?size=2#top`,
      );
      expect(resolver('https://example.com/x.png')).toBe(
        undefined,
      );
      expect(resolver('/public/y.png')).toBe(undefined);
      expect(resolver('./missing.png')).toBe(undefined);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
