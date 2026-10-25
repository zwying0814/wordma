import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { copyStaticAssets } from './static';

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

describe('copyStaticAssets', () => {
  it('复制 public 与主题 static，public 冲突优先', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-static-'),
    );
    const themeDir = path.join(root, 'theme');
    const outDir = path.join(root, 'dist');

    try {
      writeFile(root, 'public/favicon.svg', 'public-icon');
      writeFile(root, 'public/nested/app.js', 'console.log(1)');
      writeFile(
        themeDir,
        'static/favicon.svg',
        'theme-icon',
      );
      writeFile(
        themeDir,
        'static/theme.css',
        '.theme{}',
      );
      mkdirSync(outDir, { recursive: true });

      const result = copyStaticAssets({
        root,
        themeDirectory: themeDir,
        outDir,
        basePath: '/docs/',
      });

      expect(
        readFileSync(
          path.join(outDir, 'favicon.svg'),
          'utf8',
        ),
      ).toBe('public-icon');
      expect(
        existsSync(path.join(outDir, 'nested/app.js')),
      ).toBe(true);
      expect(
        existsSync(path.join(outDir, 'theme.css')),
      ).toBe(true);
      expect(
        result.files.map((file) => file.url).sort(),
      ).toEqual([
        '/docs/favicon.svg',
        '/docs/nested/app.js',
        '/docs/theme.css',
      ]);
      expect(
        result.diagnostics.filter(
          (item) => item.code === 'STATIC_CONFLICT',
        ),
      ).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('跳过逃出源目录的符号链接', () => {
    if (process.platform === 'win32') return;

    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-static-'),
    );
    const outside = mkdtempSync(
      path.join(tmpdir(), 'wordma-static-outside-'),
    );
    const outDir = path.join(root, 'dist');

    try {
      writeFile(root, 'public/ok.txt', 'ok');
      mkdirSync(path.join(root, 'public'), {
        recursive: true,
      });
      writeFile(outside, 'secret.txt', 'secret');
      mkdirSync(outDir, { recursive: true });
      symlinkSync(
        path.join(outside, 'secret.txt'),
        path.join(root, 'public/leak.txt'),
      );

      const result = copyStaticAssets({
        root,
        themeDirectory: path.join(root, 'theme'),
        outDir,
      });

      expect(
        existsSync(path.join(outDir, 'leak.txt')),
      ).toBe(false);
      expect(
        result.diagnostics.some(
          (item) => item.code === 'UNSAFE_STATIC',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
