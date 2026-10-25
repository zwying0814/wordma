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

import { ThemeError } from '../errors';
import type { ThemeStyles } from '@wordma/theme';
import type { ThemeRuntime } from '../theme/runtime';
import {
  buildThemeStyles,
  copyThemeStyles,
} from './theme-styles';

function makeTheme(): {
  dir: string;
  runtime: (styles: ThemeStyles) => ThemeRuntime;
} {
  const dir = mkdtempSync(
    path.join(tmpdir(), 'wordma-theme-css-'),
  );
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(
    path.join(dir, 'src/index.tsx'),
    'export default { layouts: {} };\n',
  );

  return {
    dir,
    runtime: (styles: ThemeStyles): ThemeRuntime => ({
      directory: dir,
      manifest: {
        id: 'wordma-theme-test',
        displayName: 'Test',
        version: '0.0.0',
        engines: { wordma: '>=0.0.0' },
        settings: [],
        pages: [],
      },
      definition: {
        layouts: {},
        styles,
      },
      entryPath: path.join(dir, 'src/index.tsx'),
      diagnostics: [],
    }),
  };
}

function writeCss(
  dir: string,
  name: string,
  source: string,
): void {
  mkdirSync(path.dirname(path.join(dir, name)), {
    recursive: true,
  });
  writeFileSync(path.join(dir, name), source);
}

function expectThemeError(
  run: () => unknown,
  code: string,
): ThemeError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ThemeError);
    expect((error as ThemeError).code).toBe(code);
    return error as ThemeError;
  }

  throw new Error(`预期抛出 ThemeError(${code})`);
}

describe('buildThemeStyles', () => {
  it('编译、压缩并生成 hash URL', () => {
    const theme = makeTheme();
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-theme-css-cache-'),
    );

    try {
      writeCss(
        theme.dir,
        'src/styles/a.css',
        ':root { --x: red; }\nbody { color: var(--x); }\n',
      );

      const result = buildThemeStyles({
        themeRuntime: theme.runtime(['./styles/a.css']),
        cacheDir,
        basePath: '/docs/',
      });

      expect(result.css?.url).toStartWith(
        '/docs/assets/css/theme-',
      );
      expect(result.css?.bytes).toBeGreaterThan(0);
      expect(result.css?.sources).toEqual(['src/styles/a.css']);
      expect(existsSync(result.css?.filePath ?? '')).toBe(
        true,
      );

      const css = readFileSync(
        result.css?.filePath ?? '',
        'utf8',
      );
      expect(css).toContain('--x:red');
      expect(css).toContain('color:var(--x)');
      expect(css).not.toContain('\n');
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('按 tokens → global → prose 合并并去重', () => {
    const theme = makeTheme();
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-theme-css-cache-'),
    );

    try {
      writeCss(
        theme.dir,
        'src/styles/tokens.css',
        ':root { --x: 1; }',
      );
      writeCss(
        theme.dir,
        'src/styles/global.css',
        'body { margin: 0; }',
      );
      writeCss(
        theme.dir,
        'src/styles/prose.css',
        '.prose { max-width: 42rem; }',
      );

      const result = buildThemeStyles({
        themeRuntime: theme.runtime({
          prose: ['./styles/prose.css'],
          global: [
            './styles/global.css',
            './styles/tokens.css',
          ],
          tokens: ['./styles/tokens.css'],
        }),
        cacheDir,
      });
      const css = readFileSync(
        result.css?.filePath ?? '',
        'utf8',
      );

      expect(result.css?.sources).toEqual([
        'src/styles/tokens.css',
        'src/styles/global.css',
        'src/styles/prose.css',
      ]);
      expect(css.indexOf('--x:1')).toBeLessThan(
        css.indexOf('body{margin:0}'),
      );
      expect(css.indexOf('body{margin:0}')).toBeLessThan(
        css.indexOf('.prose{max-width:42rem}'),
      );
      expect(
        css.match(/--x:1/g),
      ).toHaveLength(1);
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('打包相对 @import 并保持声明顺序', () => {
    const theme = makeTheme();
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-theme-css-cache-'),
    );

    try {
      writeCss(
        theme.dir,
        'src/styles/tokens.css',
        ':root { --color: red; }\n',
      );
      writeCss(
        theme.dir,
        'src/styles/main.css',
        '@import "./tokens.css";\nbody { color: var(--color); }\n',
      );
      writeCss(
        theme.dir,
        'src/styles/last.css',
        '.last { display: block; }\n',
      );

      const result = buildThemeStyles({
        themeRuntime: theme.runtime([
          './styles/main.css',
          './styles/last.css',
          './styles/main.css',
        ]),
        cacheDir,
      });
      const css = readFileSync(
        result.css?.filePath ?? '',
        'utf8',
      );

      expect(css).toContain('--color:red');
      expect(css.indexOf('--color:red')).toBeLessThan(
        css.indexOf('.last'),
      );
      expect(result.css?.sources).toEqual([
        'src/styles/main.css',
        'src/styles/last.css',
      ]);
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('拒绝缺失、越界、绝对路径与非 CSS 文件', () => {
    const theme = makeTheme();
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-theme-css-cache-'),
    );

    try {
      expectThemeError(
        () =>
          buildThemeStyles({
            themeRuntime: theme.runtime([
              './styles/missing.css',
            ]),
            cacheDir,
          }),
        'MISSING_STYLE',
      );

      expectThemeError(
        () =>
          buildThemeStyles({
            themeRuntime: theme.runtime([
              '../../outside.css',
            ]),
            cacheDir,
          }),
        'UNSAFE_STYLE',
      );

      expectThemeError(
        () =>
          buildThemeStyles({
            themeRuntime: theme.runtime([
              path.join(theme.dir, 'src/styles/a.css'),
            ]),
            cacheDir,
          }),
        'UNSAFE_STYLE',
      );

      writeCss(theme.dir, 'src/styles/a.txt', 'body{}');
      expectThemeError(
        () =>
          buildThemeStyles({
            themeRuntime: theme.runtime([
              './styles/a.txt',
            ]),
            cacheDir,
          }),
        'MISSING_STYLE',
      );
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('重复构建 hash 稳定并复制到 dist', () => {
    const theme = makeTheme();
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-theme-css-cache-'),
    );
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-theme-css-out-'),
    );

    try {
      writeCss(theme.dir, 'src/styles/a.css', 'body { color: red; }');
      const runtime = theme.runtime(['./styles/a.css']);

      const first = buildThemeStyles({
        themeRuntime: runtime,
        cacheDir,
      });
      const second = buildThemeStyles({
        themeRuntime: runtime,
        cacheDir,
      });

      expect(second.css?.url).toBe(first.css?.url);

      copyThemeStyles(outDir, second);
      expect(
        existsSync(
          path.join(
            outDir,
            'assets/css',
            path.basename(second.css?.filePath ?? ''),
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('无 styles 时不产出 CSS', () => {
    const theme = makeTheme();

    try {
      expect(
        buildThemeStyles({
          themeRuntime: theme.runtime([]),
          cacheDir: path.join(theme.dir, '.cache'),
        }),
      ).toEqual({});
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
    }
  });
});
