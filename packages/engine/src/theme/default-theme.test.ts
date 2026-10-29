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

import {
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';
import { loadThemePackage } from '@wordma/theme';

import { buildSite } from '../build';
import {
  defaultThemeDirectory,
  resolveThemeDirectory,
} from './resolve';
import { loadThemeRuntime } from './runtime';
import { resolveThemeSettings } from './settings';
import { checkThemeEngines } from './version';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);
const defaultThemeDir = path.join(
  repoRoot,
  'themes/default',
);

describe('default theme contract', () => {  it('package、manifest、版本与 settings 满足契约', () => {
    const loaded = loadThemePackage(defaultThemeDir);
    const manifest = parseThemeManifest(
      parseYamlFile(
        path.join(defaultThemeDir, 'theme.yaml'),
      ),
    );
    const packageJson = JSON.parse(
      readFileSync(
        path.join(defaultThemeDir, 'package.json'),
        'utf8',
      ),
    ) as {
      name: string;
      peerDependencies?: Record<string, string>;
    };

    expect(loaded.packageJson.name).toBe(
      'wordma-theme-default',
    );
    expect(manifest.id).toBe(packageJson.name);
    expect(manifest.displayName).toBe('Default');
    expect(manifest.engines.wordma).toBe('>=0.0.0');
    expect(checkThemeEngines(manifest).ok).toBe(true);
    expect(manifest.pages).toEqual([]);
    expect(manifest.content?.post.fields).toEqual([]);
    expect(manifest.content?.page.fields).toEqual([]);

    expect(
      packageJson.peerDependencies,
    ).toMatchObject({
      '@wordma/theme': '*',
      react: expect.any(String),
      'react-dom': expect.any(String),
    });

    const settings = resolveThemeSettings(manifest, {});
    expect(settings.diagnostics).toEqual([]);
    expect(settings.values).toEqual({
      accent: '#3563d9',
      showDescription: true,
    });
  });

  it('内置主题支持资源目录环境变量', () => {
    const previousDefault =
      process.env.WORDMA_DEFAULT_THEME_DIR;
    const previousRoot = process.env.WORDMA_ENGINE_ROOT;
    const emptyRoot = path.join(
      tmpdir(),
      'wordma-no-default-theme',
    );

    try {
      process.env.WORDMA_DEFAULT_THEME_DIR =
        defaultThemeDir;
      delete process.env.WORDMA_ENGINE_ROOT;

      expect(defaultThemeDirectory()).toBe(defaultThemeDir);
      expect(
        resolveThemeDirectory(
          emptyRoot,
          'wordma-theme-default',
        ),
      ).toBe(defaultThemeDir);

      delete process.env.WORDMA_DEFAULT_THEME_DIR;
      process.env.WORDMA_ENGINE_ROOT = repoRoot;

      expect(defaultThemeDirectory()).toBe(defaultThemeDir);
    } finally {
      if (previousDefault === undefined) {
        delete process.env.WORDMA_DEFAULT_THEME_DIR;
      } else {
        process.env.WORDMA_DEFAULT_THEME_DIR =
          previousDefault;
      }

      if (previousRoot === undefined) {
        delete process.env.WORDMA_ENGINE_ROOT;
      } else {
        process.env.WORDMA_ENGINE_ROOT = previousRoot;
      }
    }
  });

  it('布局、样式分组与 engine 内置解析可用', async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-default-theme-'),
    );
    const outDir = path.join(root, 'dist');

    const write = (
      relativePath: string,
      source: string,
    ): void => {
      const file = path.join(root, relativePath);
      mkdirSync(path.dirname(file), {
        recursive: true,
      });
      writeFileSync(file, source);
    };

    try {
      expect(existsSync(path.join(root, 'themes'))).toBe(
        false,
      );
      expect(
        existsSync(path.join(root, 'node_modules')),
      ).toBe(false);
      expect(
        resolveThemeDirectory(
          root,
          'wordma-theme-default',
        ),
      ).toBe(defaultThemeDir);

      const runtime = await loadThemeRuntime(
        root,
        'wordma-theme-default',
      );

      for (const key of [
        'root',
        'index',
        'post',
        'page',
        'archive',
        'taxonomy',
        'notFound',
      ]) {
        expect(
          typeof runtime.definition.layouts[key],
        ).toBe('function');
      }

      expect(runtime.definition.styles).toEqual({
        tokens: ['./styles/tokens.css'],
        global: ['./styles/global.css'],
        prose: ['./styles/prose.css'],
      });

      for (const file of [
        'tokens.css',
        'global.css',
        'prose.css',
      ]) {
        expect(
          readFileSync(
            path.join(
              defaultThemeDir,
              'src/styles',
              file,
            ),
            'utf8',
          ).length,
        ).toBeGreaterThan(0);
      }

      write(
        'wordma.site.yaml',
        [
          'site:',
          '  title: Default Only',
          'theme:',
          '  id: wordma-theme-default',
        ].join('\n'),
      );
      write(
        'content/posts/hello.mdx',
        '---\ntitle: Hello\n---\n\n# Hello',
      );

      const result = await buildSite({ root, outDir });
      const html = readFileSync(
        path.join(outDir, 'index.html'),
        'utf8',
      );

      expect(result.theme.id).toBe('wordma-theme-default');
      expect(html).toContain('Default Only');
      expect(html).toContain('/assets/css/theme-');
      expect(
        readdirSync(
          path.join(outDir, 'assets/css'),
        ).filter((file) => file.endsWith('.css')),
      ).toHaveLength(1);
      expect(
        existsSync(path.join(outDir, '404.html')),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
