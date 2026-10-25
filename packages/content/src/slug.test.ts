import { describe, expect, it } from 'bun:test';

import {
  ContentError,
  normalizeSlug,
  slugFromEntry,
} from './index';

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

describe('normalizeSlug', () => {
  it('处理空格并小写化', () => {
    expect(normalizeSlug(' Hello World ')).toBe('hello-world');
  });

  it('保留 Unicode 并处理空格', () => {
    expect(normalizeSlug('你好 世界')).toBe('你好-世界');
  });

  it('下划线和路径分隔符转为连字符', () => {
    expect(normalizeSlug('a_b')).toBe('a-b');
    expect(normalizeSlug('a/b\\c')).toBe('a-b-c');
  });

  it('NFKC 归一化全角字符', () => {
    expect(normalizeSlug('ＡＢＣ')).toBe('abc');
  });

  it('保留带重音的字符', () => {
    expect(normalizeSlug('Café')).toBe('café');
  });

  it('合并连续连字符并去掉首尾连字符', () => {
    expect(normalizeSlug('--a---b--')).toBe('a-b');
  });

  it('空结果报 INVALID_SLUG', () => {
    expectContentError(() => normalizeSlug('---'), 'INVALID_SLUG');
    expectContentError(() => normalizeSlug('   '), 'INVALID_SLUG');
  });
});

describe('slugFromEntry', () => {
  it('从 standalone 文件推导', () => {
    expect(slugFromEntry('posts/hello.mdx')).toBe('hello');
    expect(slugFromEntry('pages/about.md')).toBe('about');
  });

  it('从 folder entry 推导', () => {
    expect(slugFromEntry('posts/hello/index.mdx')).toBe('hello');
    expect(slugFromEntry('posts/hello/index.md')).toBe('hello');
  });

  it('从中文文件名推导', () => {
    expect(slugFromEntry('posts/你好 世界.mdx')).toBe('你好-世界');
  });
});
