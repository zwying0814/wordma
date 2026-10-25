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

import { buildSite } from '../build';
import { containsBundledReact } from '../islands/bundle';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);
const snapshotsDir = path.join(
  import.meta.dirname,
  '__snapshots__',
);
const updateSnapshots = process.env.UPDATE_SNAPSHOTS === '1';

function expectGolden(name: string, html: string): void {
  const file = path.join(snapshotsDir, name);

  if (updateSnapshots) {
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(file, html);
    return;
  }

  if (!existsSync(file)) {
    throw new Error(
      `缺少快照：${file}（运行 UPDATE_SNAPSHOTS=1 更新）`,
    );
  }

  const golden = readFileSync(file, 'utf8');
  expect(html.replace(/\r\n/g, '\n')).toBe(
    golden.replace(/\r\n/g, '\n'),
  );
}

function normalizeAssetHashes(html: string): string {
  return html
    .replace(
      /island-[a-f0-9]{16}-[a-f0-9]{8}\.(js|css)/g,
      'island-HASH.$1',
    )
    .replace(/react-[a-f0-9]{10}\.js/g, 'react-HASH.js')
    .replace(/mount-[a-f0-9]{10}\.js/g, 'mount-HASH.js');
}

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'wordma-golden-'));
}

describe('M3 golden HTML', () => {
  it('岛屿页面占位符、props、slot 与资产', async () => {
    const root = path.join(repoRoot, 'fixtures/islands');
    const outDir = makeOutDir();

    try {
      await buildSite({ root, outDir });
      const html = readFileSync(
        path.join(outDir, 'posts/islands/index.html'),
        'utf8',
      );

      expectGolden(
        'islands-post.html',
        normalizeAssetHashes(html),
      );
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(root, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });

  it('资产文件名稳定且岛屿产物不含 React', async () => {
    const root = path.join(repoRoot, 'fixtures/islands');
    const firstOut = makeOutDir();
    const secondOut = makeOutDir();

    try {
      await buildSite({ root, outDir: firstOut });
      await buildSite({ root, outDir: secondOut });

      const list = (dir: string) =>
        readdirSync(path.join(dir, 'assets/islands')).sort();
      const first = list(firstOut);
      const second = list(secondOut);

      expect(first).toEqual(second);
      expect(
        first.filter(
          (file) =>
            file.startsWith('island-') &&
            file.endsWith('.js'),
        ),
      ).toHaveLength(2);
      expect(
        first.some((file) => file.startsWith('react-')),
      ).toBe(true);
      expect(
        first.some((file) => file.startsWith('mount-')),
      ).toBe(true);

      const islandFile = first.find(
        (file) =>
          file.startsWith('island-') &&
          file.endsWith('.js'),
      );
      if (!islandFile) throw new Error('缺少岛屿产物');

      const js = readFileSync(
        path.join(
          firstOut,
          'assets/islands',
          islandFile,
        ),
        'utf8',
      );

      expect(js).toMatch(/from"react/);
      expect(containsBundledReact(js)).toBe(false);
    } finally {
      rmSync(firstOut, { recursive: true, force: true });
      rmSync(secondOut, { recursive: true, force: true });
      rmSync(path.join(root, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });

  it('无岛屿页面不注入资产', async () => {
    const root = path.join(repoRoot, 'fixtures/content-layer');
    const outDir = makeOutDir();

    try {
      await buildSite({ root, outDir });
      const html = readFileSync(
        path.join(
          outDir,
          'posts/standalone-post/index.html',
        ),
        'utf8',
      );

      expect(html).not.toContain('importmap');
      expect(html).not.toContain('/assets/islands/');
      expectGolden('content-post.html', html);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
