import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { listThemes } from './list';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);

function writeTheme(
  root: string,
  relative: string,
  options: {
    id: string;
    displayName?: string;
    engines?: string;
    packageName?: string;
  },
): void {
  const directory = path.join(root, relative);
  const src = path.join(directory, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    path.join(directory, 'theme.yaml'),
    [
      `id: ${options.id}`,
      `displayName: ${options.displayName ?? options.id}`,
      'version: 1.0.0',
      'engines:',
      `  wordma: "${options.engines ?? '>=0.0.0'}"`,
      'settings: []',
      'content:',
      '  version: 1',
      '  post:',
      '    fields: []',
      '  page:',
      '    fields: []',
      '  pageTypes: {}',
      'pages: []',
    ].join('\n'),
  );
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: options.packageName ?? options.id,
      version: '1.0.0',
      type: 'module',
      exports: { '.': './src/index.tsx' },
    }),
  );
  writeFileSync(
    path.join(src, 'index.tsx'),
    'export default { layouts: {} };\n',
  );
}

function makeWorkspace(): string {
  return mkdtempSync(
    path.join(tmpdir(), 'wordma-theme-list-'),
  );
}

describe('listThemes', () => {
  it('列出 workspace、dependency 与 builtin', () => {
    const root = makeWorkspace();

    try {
      writeTheme(root, 'themes/wordma-theme-local', {
        id: 'wordma-theme-local',
        displayName: 'Local',
      });
      writeTheme(
        root,
        'node_modules/wordma-theme-dep',
        {
          id: 'wordma-theme-dep',
          displayName: 'Dependency',
        },
      );

      const themes = listThemes(root);
      const byId = new Map(
        themes.map((theme) => [theme.id, theme]),
      );

      expect(byId.get('wordma-theme-local')?.source).toBe(
        'workspace',
      );
      expect(byId.get('wordma-theme-dep')?.source).toBe(
        'dependency',
      );
      expect(
        byId.get('wordma-theme-default')?.source,
      ).toBe('builtin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('workspace 同名主题优先于 dependency', () => {
    const root = makeWorkspace();

    try {
      writeTheme(root, 'themes/local-copy', {
        id: 'wordma-theme-dup',
        displayName: 'Workspace Copy',
      });
      writeTheme(root, 'node_modules/dep-copy', {
        id: 'wordma-theme-dup',
        displayName: 'Dependency Copy',
      });

      const themes = listThemes(root).filter(
        (theme) => theme.id === 'wordma-theme-dup',
      );

      expect(themes).toHaveLength(1);
      expect(themes[0]?.source).toBe('workspace');
      expect(themes[0]?.displayName).toBe(
        'Workspace Copy',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('标记引擎版本不兼容的主题', () => {
    const root = makeWorkspace();

    try {
      writeTheme(root, 'themes/wordma-theme-future', {
        id: 'wordma-theme-future',
        engines: '>=99.0.0',
      });

      const theme = listThemes(root).find(
        (item) => item.id === 'wordma-theme-future',
      );

      expect(theme?.compatible).toBe(false);
      expect(
        theme?.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'ENGINE_VERSION_MISMATCH',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fixtures/theme-switch 列出两个工作区主题', () => {
    const themes = listThemes(
      path.join(repoRoot, 'fixtures/theme-switch'),
    );
    const ids = themes
      .filter((theme) => theme.source === 'workspace')
      .map((theme) => theme.id);

    expect(ids).toEqual([
      'wordma-theme-journal',
      'wordma-theme-minimal',
    ]);
  });
});
