import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { ContentError, YamlParseError } from '@wordma/content';

import { inspectWorkspace } from './inspect';

const root = path.resolve(import.meta.dirname, '../../..');

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

  it('坏主题 manifest 抛出错误', () => {
    expect(() =>
      inspectWorkspace(path.join(root, 'fixtures/broken/bad-theme')),
    ).toThrow();
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
