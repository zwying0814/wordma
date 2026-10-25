import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { MdxError } from '../errors';
import { parseMdx } from './parse';
import { renderMdx } from './render';
import type { RenderMdxOptions } from './render';

const filePath = path.resolve(
  import.meta.dirname,
  '../../../fixtures/minimal/content/posts/hello.mdx',
);

async function render(
  source: string,
  options: RenderMdxOptions = {},
) {
  const parsed = parseMdx(source, { filePath });

  return renderMdx(parsed.tree, { filePath, ...options });
}

function expectMdxError(error: unknown, code: string): MdxError {
  expect(error).toBeInstanceOf(MdxError);
  expect((error as MdxError).code).toBe(code);
  return error as MdxError;
}

describe('renderMdx', () => {
  it('渲染 GFM 表格、删除线与任务列表', async () => {
    const result = await render(
      [
        '| Name | Value |',
        '| --- | --- |',
        '| a | 1 |',
        '',
        '~~gone~~',
        '',
        '- [x] done',
        '- [ ] todo',
      ].join('\n'),
    );

    expect(result.html).toContain('<table>');
    expect(result.html).toContain('<th>Name</th>');
    expect(result.html).toContain('<td>a</td>');
    expect(result.html).toContain('<del>gone</del>');
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).toContain('checked');
  });

  it('生成标题 ID、锚点与 headings 数据', async () => {
    const result = await render(
      [
        '## Hello World',
        '',
        '### 你好',
        '',
        '## Hello World',
        '',
        '## Use `foo`',
      ].join('\n'),
    );

    expect(result.html).toContain('id="hello-world"');
    expect(result.html).toContain(
      'href="#hello-world"',
    );
    expect(result.html).toContain('id="hello-world-1"');
    expect(result.html).toContain('class="heading-anchor"');
    expect(result.html).toContain('id="你好"');
    expect(result.headings).toEqual([
      { id: 'hello-world', text: 'Hello World', depth: 2 },
      { id: '你好', text: '你好', depth: 3 },
      { id: 'hello-world-1', text: 'Hello World', depth: 2 },
      { id: 'use-foo', text: 'Use foo', depth: 2 },
    ]);
  });

  it('用 Shiki 高亮代码块', async () => {
    const result = await render(
      ['```ts', 'const answer = 42;', '```'].join('\n'),
    );

    expect(result.html).toContain('class="shiki');
    expect(result.html).toContain('answer');
    expect(result.html).toContain('<span');
  });

  it('未知语言退化为纯文本', async () => {
    const result = await render(
      ['```not-a-language', 'plain text', '```'].join('\n'),
    );

    expect(result.html).toContain('plain text');
  });

  it('渲染行内与块级公式', async () => {
    const result = await render(
      [
        'Euler: $e^{i\\pi}+1=0$',
        '',
        '$$',
        'a^2 + b^2 = c^2',
        '$$',
      ].join('\n'),
    );

    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain('class="katex-display"');
    expect(result.html).toContain('application/x-tex');
  });

  it('公式错误报 MATH_RENDER_FAILED', async () => {
    try {
      await render('$\\frac{1}{$');
    } catch (error) {
      const mdError = expectMdxError(
        error,
        'MATH_RENDER_FAILED',
      );
      expect(mdError.file).toBe(filePath);
      expect(mdError.message).toContain('数学公式渲染失败');
      return;
    }

    throw new Error('预期抛出 MdxError(MATH_RENDER_FAILED)');
  });

  it('提取首段纯文本 excerpt 并限制长度', async () => {
    const result = await render(
      [
        'First **bold** paragraph.',
        '',
        'Second paragraph.',
      ].join('\n'),
    );

    expect(result.excerpt).toBe('First bold paragraph.');

    const long = await render(`${'a'.repeat(200)}`);
    expect(long.excerpt).toHaveLength(160);
    expect(long.excerpt?.endsWith('…')).toBe(true);

    const empty = await render('## Only heading');
    expect(empty.excerpt).toBeUndefined();
  });

  it('忽略 ESM import', async () => {
    const result = await render(
      [
        "import Counter from './counter';",
        '',
        '# Hello',
      ].join('\n'),
    );

    expect(result.html).not.toContain('import');
    expect(result.html).toContain('<h1 id="hello">');
    expect(result.html).toContain('Hello');
  });

  it('拒绝 MDX 表达式与 JSX', async () => {
    try {
      await render('{1 + 1}');
    } catch (error) {
      const mdError = expectMdxError(
        error,
        'UNSUPPORTED_EXPRESSION',
      );
      expect(mdError.file).toBe(filePath);
    }

    try {
      await render('<Counter />');
    } catch (error) {
      expectMdxError(error, 'UNSUPPORTED_MDX_JSX');
      return;
    }

    throw new Error('预期抛出 MdxError(UNSUPPORTED_MDX_JSX)');
  });

  it('支持自定义代码主题', async () => {
    const result = await render(
      ['```ts', 'const value = 1;', '```'].join('\n'),
      { codeTheme: 'github-dark' },
    );

    expect(result.html).toContain('shiki');
    expect(result.html).toContain('background-color');
  });
});
