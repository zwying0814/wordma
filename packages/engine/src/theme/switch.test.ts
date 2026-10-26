import { describe, expect, it } from 'bun:test';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  loadWorkspace,
  parseThemeManifest,
  parseYamlFile,
  type ThemeManifest,
} from '@wordma/content';

import { buildSite } from '../build';
import { applyThemeContentSchema } from './content-fields';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);
const fixtureRoot = path.join(
  repoRoot,
  'fixtures/theme-switch',
);
const defaultThemeEntry = path.join(
  repoRoot,
  'themes/default/src/index.tsx',
);

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function createWorkspace(): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-theme-switch-'),
  );

  writeFile(
    root,
    'wordma.site.yaml',
    [
      'site:',
      '  title: Theme Switch',
      'theme:',
      '  id: wordma-theme-journal',
    ].join('\n'),
  );

  const content = path.join(
    root,
    'content/posts/switching.mdx',
  );
  mkdirSync(path.dirname(content), {
    recursive: true,
  });
  copyFileSync(
    path.join(
      fixtureRoot,
      'content/posts/switching.mdx',
    ),
    content,
  );

  for (const id of [
    'wordma-theme-journal',
    'wordma-theme-minimal',
  ]) {
    const themeDir = path.join(root, 'themes', id);
    const srcDir = path.join(themeDir, 'src');

    mkdirSync(srcDir, { recursive: true });
    copyFileSync(
      path.join(
        fixtureRoot,
        'themes',
        id,
        'theme.yaml',
      ),
      path.join(themeDir, 'theme.yaml'),
    );
    writeFile(
      root,
      `themes/${id}/package.json`,
      JSON.stringify({
        name: id,
        version: '0.0.0',
        type: 'module',
        exports: { '.': './src/index.tsx' },
      }),
    );

    const relative = path
      .relative(srcDir, defaultThemeEntry)
      .split(path.sep)
      .join('/');
    const specifier = relative.startsWith('.')
      ? relative
      : `./${relative}`;

    writeFile(
      root,
      `themes/${id}/src/index.tsx`,
      `import defaultTheme from '${specifier}';\nexport default { layouts: defaultTheme.layouts };\n`,
    );
  }

  return root;
}

function manifest(id: string): ThemeManifest {
  return parseThemeManifest(
    parseYamlFile(
      path.join(
        fixtureRoot,
        'themes',
        id,
        'theme.yaml',
      ),
    ),
  );
}

function switchTheme(root: string, themeId: string): void {
  const sitePath = path.join(root, 'wordma.site.yaml');
  writeFileSync(
    sitePath,
    readFileSync(sitePath, 'utf8').replace(
      /  id: .+/,
      `  id: ${themeId}`,
    ),
  );
}

describe('theme switch', () => {
  it('切换主题构建时内容文件不变，两个 namespace 保留', async () => {
    const root = createWorkspace();
    const contentPath = path.join(
      root,
      'content/posts/switching.mdx',
    );
    const outDir = path.join(root, 'dist');
    const original = readFileSync(contentPath);

    try {
      const journalBuild = await buildSite({
        root,
        outDir,
      });
      expect(journalBuild.theme.id).toBe(
        'wordma-theme-journal',
      );
      expect(
        readFileSync(contentPath).equals(original),
      ).toBe(true);

      switchTheme(root, 'wordma-theme-minimal');
      const minimalBuild = await buildSite({
        root,
        outDir,
      });
      expect(minimalBuild.theme.id).toBe(
        'wordma-theme-minimal',
      );
      expect(
        readFileSync(contentPath).equals(original),
      ).toBe(true);

      const workspace = loadWorkspace(root);
      const entry = workspace.index.entries.find(
        (item) => item.id === 'posts/switching',
      );
      if (!entry) throw new Error('缺少 entry');

      applyThemeContentSchema(
        workspace,
        manifest('wordma-theme-journal'),
        'wordma-theme-journal',
      );

      expect(entry.meta.data.theme).toMatchObject({
        'wordma-theme-journal': {
          heroStyle: 'wide',
        },
        'wordma-theme-minimal': {
          compact: true,
        },
      });

      applyThemeContentSchema(
        workspace,
        manifest('wordma-theme-minimal'),
        'wordma-theme-minimal',
      );

      expect(entry.meta.data.theme).toMatchObject({
        'wordma-theme-journal': {
          heroStyle: 'wide',
        },
        'wordma-theme-minimal': {
          compact: true,
        },
      });
      expect(
        readFileSync(contentPath).equals(original),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('新主题缺失字段时补默认值，旧 namespace 不丢', () => {
    const root = createWorkspace();
    const contentPath = path.join(
      root,
      'content/posts/switching.mdx',
    );

    try {
      writeFileSync(
        contentPath,
        [
          '---',
          'title: Switching Themes',
          'theme:',
          '  wordma-theme-minimal:',
          '    compact: true',
          '---',
          '',
          '# Switching',
        ].join('\n'),
      );
      const original = readFileSync(contentPath);
      const workspace = loadWorkspace(root);
      const entry = workspace.index.entries[0];
      if (!entry) throw new Error('缺少 entry');

      applyThemeContentSchema(
        workspace,
        manifest('wordma-theme-journal'),
        'wordma-theme-journal',
      );

      expect(entry.meta.data.theme).toMatchObject({
        'wordma-theme-journal': {
          heroStyle: 'wide',
        },
        'wordma-theme-minimal': {
          compact: true,
        },
      });
      expect(
        readFileSync(contentPath).equals(original),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
