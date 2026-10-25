import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { YamlParseError, parseYaml, parseYamlFile } from './parse';

function catchYamlError(run: () => unknown): YamlParseError {
  try {
    run();
  } catch (error) {
    if (error instanceof YamlParseError) return error;
    throw error;
  }

  throw new Error('预期抛出 YamlParseError');
}

describe('parseYaml', () => {
  it('使用 YAML 1.2 语义解析普通内容', () => {
    const result = parseYaml('a: yes\nb: no\nc: 2026-10-25\n');

    expect(result).toEqual({
      a: 'yes',
      b: 'no',
      c: '2026-10-25',
    });
  });

  it('拒绝重复 key', () => {
    const error = catchYamlError(() =>
      parseYaml('a: 1\na: 2\n', { filePath: 'dup.yaml' }),
    );

    expect(error.diagnostics[0]?.code).toBe('DUPLICATE_KEY');
    expect(error.diagnostics[0]?.file).toBe('dup.yaml');
    expect(error.diagnostics[0]?.line).toBe(2);
  });

  it('拒绝错误缩进', () => {
    const error = catchYamlError(() =>
      parseYaml('a:\n  b: 1\n c: 2\n'),
    );

    expect(error.diagnostics[0]?.code).toBe('BAD_INDENT');
  });

  it('拒绝自定义 tag', () => {
    const error = catchYamlError(() => parseYaml('a: !foo bar\n'));

    expect(error.diagnostics[0]?.code).toBe('CUSTOM_TAG');
  });

  it('拒绝超出上限的 alias', () => {
    const source =
      'base: &b { x: 1 }\nitems:\n' +
      Array.from({ length: 51 }, () => '  - *b').join('\n');

    const error = catchYamlError(() => parseYaml(source));

    expect(error.diagnostics[0]?.code).toBe('ALIAS_LIMIT');
  });

  it('可以读取文件', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wordma-yaml-'));
    const file = join(directory, 'site.yaml');
    writeFileSync(file, 'title: test\n');

    try {
      expect(parseYamlFile(file)).toEqual({ title: 'test' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
