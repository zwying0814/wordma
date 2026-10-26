import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';
import { loadThemePackage } from '@wordma/theme';
import { buildSite, loadThemeRuntime } from '@wordma/engine';

import {
  CreateThemeError,
  createTheme,
} from './create-theme';

const cliPath = path.resolve(
  import.meta.dirname,
  'cli.ts',
);

function makeWorkspace(): string {
  return mkdtempSync(
    path.join(import.meta.dirname, '.workspace-'),
  );
}

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function expectCreateError(
  run: () => unknown,
  code: string,
): CreateThemeError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CreateThemeError);
    expect((error as CreateThemeError).code).toBe(code);
    return error as CreateThemeError;
  }

  throw new Error(`预期 CreateThemeError(${code})`);
}

describe('createTheme', () => {
  it('生成可加载、可构建的主题', async () => {
    const root = makeWorkspace();
    const id = 'wordma-theme-generated';
    const outDir = path.join(root, 'dist');

    try {
      const created = createTheme({ id, root });

      expect(created.themeDir).toBe(
        path.join(root, 'themes', id),
      );
      expect(created.files).toEqual(
        expect.arrayContaining([
          'package.json',
          'theme.yaml',
          'src/index.tsx',
          'src/layouts/root.tsx',
          'src/layouts/index.tsx',
          'src/layouts/post.tsx',
          'src/layouts/page.tsx',
          'src/layouts/not-found.tsx',
          'src/styles/tokens.css',
          'src/styles/global.css',
          'src/styles/prose.css',
          'README.md',
        ]),
      );

      for (const file of created.files) {
        expect(
          existsSync(
            path.join(created.themeDir, file),
          ),
        ).toBe(true);
      }

      const manifest = parseThemeManifest(
        parseYamlFile(
          path.join(
            created.themeDir,
            'theme.yaml',
          ),
        ),
      );
      const loaded = loadThemePackage(created.themeDir);

      expect(manifest.id).toBe(id);
      expect(manifest.displayName).toBe('Generated');
      expect(loaded.packageJson.name).toBe(id);

      const runtime = await loadThemeRuntime(root, id);
      for (const layout of [
        'root',
        'index',
        'post',
        'page',
        'notFound',
      ]) {
        expect(
          typeof runtime.definition.layouts[layout],
        ).toBe('function');
      }
      expect(runtime.definition.styles).toEqual({
        tokens: ['./styles/tokens.css'],
        global: ['./styles/global.css'],
        prose: ['./styles/prose.css'],
      });

      writeFile(
        root,
        'wordma.site.yaml',
        [
          'site:',
          '  title: Generated Theme Site',
          'theme:',
          `  id: ${id}`,
        ].join('\n'),
      );
      writeFile(
        root,
        'content/posts/hello.mdx',
        '---\ntitle: Hello\n---\n\n# Hello\n\nGenerated theme.',
      );

      const result = await buildSite({ root, outDir });
      expect(result.theme.id).toBe(id);
      expect(
        existsSync(path.join(outDir, 'index.html')),
      ).toBe(true);

      const post = readFileSync(
        path.join(
          outDir,
          'posts/hello/index.html',
        ),
        'utf8',
      );
      expect(post).toContain('Generated theme.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('已有非空目录默认拒绝，--force 覆盖生成文件', () => {
    const root = makeWorkspace();
    const id = 'wordma-theme-existing';

    try {
      createTheme({ id, root });
      expectCreateError(
        () => createTheme({ id, root }),
        'TARGET_NOT_EMPTY',
      );

      writeFile(
        root,
        `themes/${id}/custom.txt`,
        'keep',
      );
      const forced = createTheme({
        id,
        root,
        force: true,
      });

      expect(forced.files).toContain('theme.yaml');
      expect(
        readFileSync(
          path.join(
            root,
            'themes',
            id,
            'custom.txt',
          ),
          'utf8',
        ),
      ).toBe('keep');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('拒绝非法与 scoped id', () => {
    const root = makeWorkspace();

    try {
      expectCreateError(
        () =>
          createTheme({
            id: 'Bad Theme!',
            root,
          }),
        'INVALID_THEME_ID',
      );
      expectCreateError(
        () =>
          createTheme({
            id: '@scope/theme',
            root,
          }),
        'SCOPED_THEME_UNSUPPORTED',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('CLI --json 输出生成结果', () => {
    const root = makeWorkspace();
    const id = 'wordma-theme-cli';

    try {
      const result = spawnSync(
        process.execPath,
        [
          cliPath,
          id,
          '--root',
          root,
          '--json',
        ],
        {
          cwd: path.dirname(cliPath),
          encoding: 'utf8',
        },
      );
      const lines = result.stdout
        .trim()
        .split('\n')
        .filter(Boolean);

      expect(result.status).toBe(0);
      expect(lines).toHaveLength(1);

      const event = JSON.parse(lines[0] ?? '') as {
        v: number;
        type: string;
        themeId: string;
        path: string;
      };

      expect(event.v).toBe(1);
      expect(event.type).toBe('theme-created');
      expect(event.themeId).toBe(id);
      expect(event.path).toBe(
        path.join(root, 'themes', id),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
