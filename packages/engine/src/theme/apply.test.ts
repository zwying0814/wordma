import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseYamlFile } from '@wordma/content';

import { applyTheme, applyThemeSettings } from './apply';

type ThemeOptions = {
  id: string;
  engines?: string;
  settings?: string;
};

function writeTheme(
  root: string,
  relative: string,
  options: ThemeOptions,
): void {
  const directory = path.join(root, relative);
  const src = path.join(directory, 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    path.join(directory, 'theme.yaml'),
    [
      `id: ${options.id}`,
      `displayName: ${options.id}`,
      'version: 1.0.0',
      'engines:',
      `  wordma: "${options.engines ?? '>=0.0.0'}"`,
      options.settings ?? 'settings: []',
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
      name: options.id,
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

const settings = `settings:
  - key: title
    type: text
    label: Title
    default: Default
  - key: count
    type: number
    label: Count
    default: 2
    min: 1
    max: 5
  - key: enabled
    type: switch
    label: Enabled
    default: true
  - key: accent
    type: color
    label: Accent
    default: "#000000"`;

const siteSource = `# top comment
site:
  title: Theme Apply
  language: zh-CN

theme:
  id: wordma-theme-journal
  settings:
    # keep comment
    title: Hello # inline
    accent: "#000000"
    futureKey: keep

navigation: []
`;

const contentSource = `---
title: One
---

# One
`;

function createWorkspace(): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-theme-apply-'),
  );
  mkdirSync(path.join(root, 'content/posts'), {
    recursive: true,
  });
  writeFileSync(
    path.join(root, 'wordma.site.yaml'),
    siteSource,
  );
  writeFileSync(
    path.join(root, 'content/posts/one.mdx'),
    contentSource,
  );
  writeTheme(root, 'themes/wordma-theme-journal', {
    id: 'wordma-theme-journal',
    settings,
  });
  writeTheme(root, 'themes/wordma-theme-minimal', {
    id: 'wordma-theme-minimal',
  });
  writeTheme(root, 'themes/wordma-theme-future', {
    id: 'wordma-theme-future',
    engines: '>=99.0.0',
  });
  return root;
}

function readSite(root: string): string {
  return readFileSync(
    path.join(root, 'wordma.site.yaml'),
    'utf8',
  );
}

function siteData(root: string): {
  theme: { id: string; settings: Record<string, unknown> };
} {
  return parseYamlFile(path.join(root, 'wordma.site.yaml'));
}

describe('applyTheme', () => {
  it('切换主题并重置 settings，保留注释与内容', () => {
    const root = createWorkspace();

    try {
      const before = readFileSync(
        path.join(root, 'content/posts/one.mdx'),
        'utf8',
      );
      const result = applyTheme({
        root,
        themeId: 'wordma-theme-minimal',
        resetSettings: true,
      });
      const source = readSite(root);

      expect(result.themeId).toBe('wordma-theme-minimal');
      expect(siteData(root).theme).toEqual({
        id: 'wordma-theme-minimal',
        settings: {},
      });
      expect(source).toContain('# top comment');
      expect(
        readFileSync(
          path.join(root, 'content/posts/one.mdx'),
          'utf8',
        ),
      ).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('未要求重置时保留 settings', () => {
    const root = createWorkspace();

    try {
      applyTheme({
        root,
        themeId: 'wordma-theme-minimal',
      });

      expect(siteData(root).theme.settings).toEqual({
        title: 'Hello',
        accent: '#000000',
        futureKey: 'keep',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('主题缺失或不兼容时不修改 site 文件', () => {
    const root = createWorkspace();

    try {
      const before = readSite(root);

      expect(() =>
        applyTheme({
          root,
          themeId: 'wordma-theme-missing',
        }),
      ).toThrow('主题未找到');

      expect(() =>
        applyTheme({
          root,
          themeId: 'wordma-theme-future',
        }),
      ).toThrow('Wordma');

      expect(readSite(root)).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('applyThemeSettings', () => {
  it('更新已知设置，保留注释与未知 key', () => {
    const root = createWorkspace();

    try {
      const result = applyThemeSettings({
        root,
        values: {
          title: 'New',
          count: 4,
        },
      });
      const source = readSite(root);
      const data = siteData(root).theme.settings;

      expect(result.themeId).toBe('wordma-theme-journal');
      expect(data).toEqual({
        title: 'New',
        count: 4,
        futureKey: 'keep',
      });
      expect(source).toContain('# top comment');
      expect(source).toContain('# keep comment');
      expect(source).toContain('title: New # inline');
      expect(source).not.toContain('accent:');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('校验失败时不修改 site 文件', () => {
    const root = createWorkspace();

    try {
      const before = readSite(root);

      expect(() =>
        applyThemeSettings({
          root,
          values: { count: 99 },
        }),
      ).toThrow('count');

      expect(readSite(root)).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('未知设置返回 warning', () => {
    const root = createWorkspace();

    try {
      const result = applyThemeSettings({
        root,
        values: { futureOption: 'kept' },
      });

      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'UNKNOWN_THEME_SETTING',
          severity: 'warning',
          field: 'futureOption',
        }),
      );
      expect(siteData(root).theme.settings).toMatchObject({
        futureOption: 'kept',
        futureKey: 'keep',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
