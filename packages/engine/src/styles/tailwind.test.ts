import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ThemeRuntime } from '../theme/runtime';
import { buildSite } from '../build';
import { ThemeError } from '../errors';
import { buildThemeStyles } from './theme-styles';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);

function makeTheme(): {
  dir: string;
  runtime: ThemeRuntime;
} {
  const dir = mkdtempSync(
    path.join(tmpdir(), 'wordma-tailwind-'),
  );
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(
    path.join(dir, 'src/index.tsx'),
    'export default { layouts: {} };\n',
  );

  return {
    dir,
    runtime: {
      directory: dir,
      manifest: {
        id: 'wordma-theme-tailwind-test',
        displayName: 'Tailwind Test',
        version: '0.0.0',
        engines: { wordma: '>=0.0.0' },
        settings: [],
        pages: [],
      },
      definition: {
        layouts: {},
        styles: {
          global: ['./styles/app.css'],
        },
      },
      entryPath: path.join(dir, 'src/index.tsx'),
      diagnostics: [],
    },
  };
}

function writeCss(
  dir: string,
  name: string,
  source: string,
): void {
  const file = path.join(dir, 'src/styles', name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function expectTailwindError(
  theme: ThemeRuntime,
  cacheDir: string,
): ThemeError {
  try {
    buildThemeStyles({
      themeRuntime: theme,
      cacheDir,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ThemeError);
    expect((error as ThemeError).code).toBe(
      'TAILWIND_PRECOMPILE_REQUIRED',
    );
    return error as ThemeError;
  }

  throw new Error(
    '预期抛出 ThemeError(TAILWIND_PRECOMPILE_REQUIRED)',
  );
}

describe('Tailwind 预生成约束', () => {
  it('拒绝未预生成的 @import "tailwindcss"', () => {
    const theme = makeTheme();
    const cacheDir = path.join(theme.dir, '.cache');

    try {
      writeCss(
        theme.dir,
        'app.css',
        '@import "tailwindcss";\nbody { margin: 0; }\n',
      );
      const error = expectTailwindError(
        theme.runtime,
        cacheDir,
      );

      expect(error.path).toContain('app.css');
      expect(error.message).toContain('@tailwindcss/cli');
      expect(error.message).toContain('generated.css');
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
    }
  });

  it('拒绝 @tailwind 指令与嵌套 import', () => {
    const theme = makeTheme();
    const cacheDir = path.join(theme.dir, '.cache');

    try {
      writeCss(
        theme.dir,
        'app.css',
        '@tailwind utilities;\n',
      );
      expectTailwindError(theme.runtime, cacheDir);

      writeCss(
        theme.dir,
        'app.css',
        '@import "./partial.css";\n',
      );
      writeCss(
        theme.dir,
        'partial.css',
        '@tailwind base;\n',
      );
      const error = expectTailwindError(
        theme.runtime,
        cacheDir,
      );
      expect(error.path).toContain('partial.css');
    } finally {
      rmSync(theme.dir, { recursive: true, force: true });
    }
  });

  it('预生成 CSS 可以正常构建', async () => {
    const root = path.join(
      repoRoot,
      'fixtures/tailwind-prebuilt',
    );
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-tailwind-out-'),
    );

    try {
      await buildSite({ root, outDir });

      const html = readFileSync(
        path.join(
          outDir,
          'posts/tailwind/index.html',
        ),
        'utf8',
      );
      expect(html).toContain(
        'class="flex gap-2 rounded"',
      );

      const cssDir = path.join(outDir, 'assets/css');
      const cssFile = readdirSync(cssDir).find((file) =>
        file.endsWith('.css'),
      );
      if (!cssFile) throw new Error('缺少主题 CSS');

      const css = readFileSync(
        path.join(cssDir, cssFile),
        'utf8',
      );
      expect(css).toContain('.flex{display:flex}');
      expect(css).toContain('.gap-2{gap:.5rem}');
      expect(css).toContain('.rounded{border-radius:.25rem}');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(root, '.wordma'), {
        recursive: true,
        force: true,
      });
    }
  });
});
