import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ContentError,
  frontmatterToPageData,
  parseContentFile,
  readContentFile,
  readThemeFields,
  splitFrontmatter,
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

describe('splitFrontmatter', () => {
  it('拆分 LF frontmatter', () => {
    const result = splitFrontmatter(
      '---\ntitle: Hello\n---\nBody\n',
      'a.mdx',
    );

    expect(result.data).toBe('title: Hello');
    expect(result.body).toBe('Body\n');
    expect(result.bodyLine).toBe(4);
  });

  it('支持 CRLF 并统一为 LF', () => {
    const result = splitFrontmatter(
      '---\r\ntitle: Hello\r\n---\r\nBody\r\n',
      'a.mdx',
    );

    expect(result.data).toBe('title: Hello');
    expect(result.body).toBe('Body\n');
  });

  it('支持 UTF-8 BOM', () => {
    const result = splitFrontmatter(
      '﻿---\ntitle: Hello\n---\nBody',
      'a.mdx',
    );

    expect(result.data).toBe('title: Hello');
    expect(result.body).toBe('Body');
  });

  it('支持空正文', () => {
    const result = splitFrontmatter('---\ntitle: Hello\n---', 'a.mdx');

    expect(result.data).toBe('title: Hello');
    expect(result.body).toBe('');
  });

  it('正文中的 --- 不会被当成结束符', () => {
    const result = splitFrontmatter(
      '---\ntitle: Hello\n---\nIntro\n\n---\n\nAfter\n',
      'a.mdx',
    );

    expect(result.body).toBe('Intro\n\n---\n\nAfter\n');
  });

  it('缺少 frontmatter 时报 MISSING_FRONTMATTER', () => {
    expectContentError(
      () => splitFrontmatter('# Hello', 'a.mdx'),
      'MISSING_FRONTMATTER',
    );
  });

  it('frontmatter 未闭合时报 INVALID_FRONTMATTER', () => {
    expectContentError(
      () => splitFrontmatter('---\ntitle: Hello\n', 'a.mdx'),
      'INVALID_FRONTMATTER',
    );
  });
});

describe('parseContentFile', () => {
  it('解析并校验 frontmatter', () => {
    const parsed = parseContentFile(
      '---\ntitle: Hello\ndate: 2026-10-25\n---\nBody',
      'a.mdx',
    );

    expect(parsed.frontmatter.title).toBe('Hello');
    expect(parsed.frontmatter.date).toBe('2026-10-25');
    expect(parsed.frontmatter.tags).toEqual([]);
    expect(parsed.frontmatter.draft).toBe(false);
    expect(parsed.body).toBe('Body');
  });

  it('缺少 title 时报 INVALID_FRONTMATTER', () => {
    expectContentError(
      () => parseContentFile('---\nfoo: bar\n---\n', 'a.mdx'),
      'INVALID_FRONTMATTER',
    );
  });

  it('YAML 错误时报 INVALID_FRONTMATTER', () => {
    expectContentError(
      () => parseContentFile('---\ntitle: [\n---\n', 'a.mdx'),
      'INVALID_FRONTMATTER',
    );
  });

  it('保留主题命名空间并可读回', () => {
    const parsed = parseContentFile(
      '---\ntitle: Hello\ntheme:\n  wordma-theme-test:\n    hero: wide\n---\n',
      'a.mdx',
    );

    const data = frontmatterToPageData(parsed.frontmatter);
    const fields = readThemeFields<{ hero: string }>(
      data,
      'wordma-theme-test',
    );

    expect(fields?.hero).toBe('wide');
  });

  it('可以读取文件', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'wordma-fm-'));
    const file = path.join(directory, 'post.mdx');
    writeFileSync(file, '---\ntitle: File Post\n---\nBody');

    try {
      const parsed = readContentFile(file);
      expect(parsed.frontmatter.title).toBe('File Post');
      expect(parsed.body).toBe('Body');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
