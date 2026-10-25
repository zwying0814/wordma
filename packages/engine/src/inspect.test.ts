import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { YamlParseError } from '@wordma/content';

import { inspectWorkspace } from './inspect';

const root = path.resolve(import.meta.dirname, '../../..');

describe('inspectWorkspace', () => {
  it('读取 minimal fixture 与默认主题', () => {
    const result = inspectWorkspace(path.join(root, 'fixtures/minimal'));

    expect(result.site.title).toBe('Minimal Wordma Site');
    expect(result.themeId).toBe('wordma-theme-default');
    expect(result.theme?.id).toBe('wordma-theme-default');
    expect(result.postFields).toEqual([]);
    expect(result.pageTypes).toEqual([]);
  });

  it('读取自定义字段主题', () => {
    const result = inspectWorkspace(
      path.join(root, 'fixtures/custom-fields'),
    );

    expect(result.theme?.id).toBe('wordma-theme-custom-fields');
    expect(result.postFields.map((field) => field.key)).toEqual([
      'heroStyle',
      'featured',
    ]);
    expect(result.settings).toEqual([]);
  });

  it('读取自定义页面类型与主题页面', () => {
    const result = inspectWorkspace(
      path.join(root, 'fixtures/custom-pages'),
    );

    expect(result.pageTypes.map((pageType) => pageType.id)).toEqual([
      'about',
      'project',
    ]);
    expect(
      result.pageTypes.find((pageType) => pageType.id === 'project')?.route,
    ).toBe('/projects/[slug]');
    expect(result.pages.map((page) => page.path)).toContain('/search');
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
});
