import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ContentError, YamlParseError } from '@wordma/content';

import { inspectWorkspace } from './inspect';

const root = path.resolve(import.meta.dirname, '../../..');

function writeFile(
  workspaceRoot: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(workspaceRoot, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function makeThemeWorkspace(options: {
  themeYaml: string;
  packageJson?: string;
}): string {
  const workspaceRoot = mkdtempSync(
    path.join(tmpdir(), 'wordma-inspect-theme-'),
  );
  const themeId = 'wordma-theme-broken';

  writeFile(
    workspaceRoot,
    'wordma.site.yaml',
    [
      'site:',
      '  title: Broken Theme',
      'theme:',
      `  id: ${themeId}`,
    ].join('\n'),
  );
  writeFile(
    workspaceRoot,
    'content/posts/ok.mdx',
    '---\ntitle: OK\n---\n\n# OK',
  );
  writeFile(
    workspaceRoot,
    `themes/${themeId}/theme.yaml`,
    options.themeYaml,
  );
  if (options.packageJson) {
    writeFile(
      workspaceRoot,
      `themes/${themeId}/package.json`,
      options.packageJson,
    );
  }

  return workspaceRoot;
}

function expectContentError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    expect((error as ContentError).code).toBe(code);
    return;
  }

  throw new Error(`预期抛出 ContentError(${code})`);
}

describe('inspectWorkspace', () => {
  it('读取 minimal fixture、默认主题与内容摘要', () => {
    const result = inspectWorkspace(path.join(root, 'fixtures/minimal'));

    expect(result.site.title).toBe('Minimal Wordma Site');
    expect(result.themeId).toBe('wordma-theme-default');
    expect(result.theme?.id).toBe('wordma-theme-default');
    expect(result.postFields).toEqual([]);
    expect(result.pageTypes).toEqual([]);
    expect(result.collections).toEqual([
      { name: 'pages', kind: 'page', count: 1 },
      { name: 'posts', kind: 'post', count: 1 },
    ]);
    expect(result.tags).toEqual([
      { name: 'hello', slug: 'hello', count: 1 },
    ]);
    expect(result.categories).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('读取自定义字段主题与内容', () => {
    const result = inspectWorkspace(
      path.join(root, 'fixtures/custom-fields'),
    );

    expect(result.theme?.id).toBe('wordma-theme-custom-fields');
    expect(result.postFields.map((field) => field.key)).toEqual([
      'heroStyle',
      'featured',
    ]);
    expect(result.settings).toEqual([]);
    expect(result.collections).toEqual([
      { name: 'posts', kind: 'post', count: 1 },
    ]);
    expect(result.tags.map((tag) => tag.slug)).toContain('theme-fields');
  });

  it('读取自定义页面类型、主题页面与内容', () => {
    const result = inspectWorkspace(
      path.join(root, 'fixtures/custom-pages'),
    );

    expect(result.pageTypes.map((pageType) => pageType.id)).toEqual([
      'about',
      'project',
    ]);
    expect(
      result.pageTypes.find((pageType) => pageType.id === 'project')
        ?.route,
    ).toBe('/projects/[slug]');
    expect(result.pages.map((page) => page.path)).toContain('/search');
    expect(result.collections).toEqual([
      { name: 'pages', kind: 'page', count: 1 },
      { name: 'projects', kind: 'custom', count: 1 },
    ]);
  });

  it('输出 content-layer 的 collections 与 taxonomy', () => {
    const result = inspectWorkspace(
      path.join(root, 'fixtures/content-layer'),
    );

    expect(result.collections).toEqual([
      { name: 'pages', kind: 'page', count: 1 },
      { name: 'posts', kind: 'post', count: 2 },
      { name: 'projects', kind: 'custom', count: 1 },
    ]);
    expect(result.tags.map((tag) => [tag.slug, tag.count])).toEqual([
      ['alpha', 2],
      ['beta', 1],
      ['project', 1],
      ['shared', 1],
    ]);
    expect(
      result.categories.map((category) => [
        category.slug,
        category.count,
      ]),
    ).toEqual([
      ['notes', 2],
      ['pages', 1],
      ['projects', 1],
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('坏 YAML 抛出 YamlParseError', () => {
    expect(() =>
      inspectWorkspace(path.join(root, 'fixtures/broken/bad-yaml')),
    ).toThrow(YamlParseError);
  });

  it('坏主题 manifest 返回诊断而不抛出', () => {
    const result = inspectWorkspace(
      path.join(root, 'fixtures/broken/bad-theme'),
    );

    expect(result.theme).toBeNull();
    expect(result.collections).toEqual([
      { name: 'posts', kind: 'post', count: 1 },
    ]);

    const diagnostic = result.diagnostics.find(
      (item) => item.code === 'INVALID_THEME',
    );

    expect(diagnostic).toMatchObject({
      severity: 'error',
      source: 'theme',
    });
    expect(diagnostic?.file).toContain('theme.yaml');
  });

  it('坏主题 YAML 与缺失 package.json 均容错', () => {
    const yamlRoot = makeThemeWorkspace({
      themeYaml: 'id: [\n',
      packageJson: JSON.stringify({
        name: 'wordma-theme-broken',
        version: '0.0.0',
        type: 'module',
        exports: { '.': './src/index.tsx' },
      }),
    });
    const packageRoot = makeThemeWorkspace({
      themeYaml: [
        'id: wordma-theme-broken',
        'displayName: Broken',
        'version: 0.0.0',
        'engines:',
        '  wordma: ">=0.0.0"',
        'settings: []',
        'pages: []',
      ].join('\n'),
    });

    try {
      const yamlResult = inspectWorkspace(yamlRoot);
      const yamlDiagnostic = yamlResult.diagnostics.find(
        (item) => item.code === 'INVALID_THEME',
      );

      expect(yamlResult.theme).toBeNull();
      expect(yamlResult.collections).toHaveLength(1);
      expect(yamlDiagnostic?.line).toBeGreaterThan(0);
      expect(yamlDiagnostic?.source).toBe('theme');

      const packageResult = inspectWorkspace(packageRoot);
      expect(packageResult.theme?.id).toBe(
        'wordma-theme-broken',
      );
      expect(
        packageResult.diagnostics.find(
          (item) => item.code === 'INVALID_THEME',
        ),
      ).toMatchObject({
        severity: 'warning',
        source: 'theme',
      });
      expect(packageResult.collections).toHaveLength(1);
    } finally {
      rmSync(yamlRoot, { recursive: true, force: true });
      rmSync(packageRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it('主题不存在时返回 THEME_NOT_FOUND 诊断', () => {
    const workspaceRoot = makeThemeWorkspace({
      themeYaml: 'id: unused',
    });

    writeFile(
      workspaceRoot,
      'wordma.site.yaml',
      [
        'site:',
        '  title: Missing Theme',
        'theme:',
        '  id: wordma-theme-missing-inspect',
      ].join('\n'),
    );

    try {
      const result = inspectWorkspace(workspaceRoot);

      expect(result.theme).toBeNull();
      expect(
        result.diagnostics.some(
          (item) => item.code === 'THEME_NOT_FOUND',
        ),
      ).toBe(true);
      expect(result.collections).toHaveLength(1);
    } finally {
      rmSync(workspaceRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it('invalid-frontmatter 抛出 ContentError', () => {
    expectContentError(
      () =>
        inspectWorkspace(
          path.join(root, 'fixtures/broken/invalid-frontmatter'),
        ),
      'INVALID_FRONTMATTER',
    );
  });

  it('invalid-date 抛出 ContentError', () => {
    expectContentError(
      () =>
        inspectWorkspace(
          path.join(root, 'fixtures/broken/invalid-date'),
        ),
      'INVALID_DATE',
    );
  });
});
