import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { MdxError } from '../errors';
import { parseMdx } from '../mdx/parse';
import { renderMdx } from '../mdx/render';
import type { RenderedMdx } from '../mdx/render';
import { resolveMdxImports } from '../mdx/resolve';
import { analyzeIslands } from './analyze';

const islandsRoot = path.resolve(
  import.meta.dirname,
  '../../../../fixtures/islands',
);
const islandsFile = path.join(
  islandsRoot,
  'content/posts/islands.mdx',
);

async function renderWithIslands(
  source: string,
  options: { js?: string } = {},
): Promise<RenderedMdx> {
  const parsed = parseMdx(source, { filePath: islandsFile });
  const references = analyzeIslands(
    parsed,
    resolveMdxImports(parsed, {
      workspaceRoot: islandsRoot,
    }),
  );

  return renderMdx(parsed.tree, {
    filePath: islandsFile,
    islands: references.map((reference) => ({
      reference,
      js: options.js ?? '/assets/islands/component-a1.js',
    })),
  });
}

function expectMdxError(error: unknown, code: string): MdxError {
  expect(error).toBeInstanceOf(MdxError);
  expect((error as MdxError).code).toBe(code);
  return error as MdxError;
}

async function expectError(
  source: string,
  code: string,
): Promise<MdxError> {
  try {
    await renderWithIslands(source);
  } catch (error) {
    return expectMdxError(error, code);
  }

  throw new Error(`预期抛出 MdxError(${code})`);
}

describe('岛屿占位符', () => {
  it('输出 props、导出名与脚本地址', async () => {
    const result = await renderWithIslands(
      [
        "import Counter from '../../components/counter';",
        '',
        '<Counter start={2} label="clicks" enabled data={{ mode: \'compact\', levels: [1, -2, true, null] }} />',
      ].join('\n'),
    );

    expect(result.islands).toHaveLength(1);
    expect(result.islands[0]?.props).toEqual({
      start: 2,
      label: 'clicks',
      enabled: true,
      data: {
        mode: 'compact',
        levels: [1, -2, true, null],
      },
    });
    expect(result.islands[0]?.exportName).toBe('default');
    expect(result.islands[0]?.relativeSource).toBe(
      'components/counter.tsx',
    );
    expect(result.html).toContain('class="wordma-island"');
    expect(result.html).toContain(
      'data-wordma-island="Counter"',
    );
    expect(result.html).toContain(
      'data-wordma-export="default"',
    );
    expect(result.html).toContain(
      'data-wordma-src="/assets/islands/component-a1.js"',
    );
    expect(result.html).toContain(
      'data-wordma-props="{&#x22;start&#x22;:2,&#x22;label&#x22;:&#x22;clicks&#x22;,&#x22;enabled&#x22;:true,&#x22;data&#x22;:{&#x22;mode&#x22;:&#x22;compact&#x22;,&#x22;levels&#x22;:[1,-2,true,null]}}"',
    );
  });

  it('成员表达式导出名包含属性路径', async () => {
    const result = await renderWithIslands(
      [
        "import UI from '../../components/note';",
        '',
        '<UI.Badge />',
      ].join('\n'),
    );

    expect(result.islands[0]?.propertyPath).toEqual(['Badge']);
    expect(result.islands[0]?.exportName).toBe('default.Badge');
    expect(result.html).toContain(
      'data-wordma-export="default.Badge"',
    );
  });

  it('children 渲染为静态 HTML slot', async () => {
    const result = await renderWithIslands(
      [
        "import { Note } from '../../components/note';",
        '',
        '<Note>',
        '  Hello **world** <strong data-x="1">!</strong>',
        '</Note>',
      ].join('\n'),
    );

    expect(result.islands[0]?.slotHtml).toContain(
      'Hello <strong>world</strong>',
    );
    expect(result.html).toContain(
      'class="wordma-island-slot"',
    );
    expect(result.html).toContain('style="display:contents"');
    expect(result.html).toContain('<strong data-x="1">!</strong>');
  });

  it('没有 children 时不输出 slot', async () => {
    const result = await renderWithIslands(
      [
        "import Counter from '../../components/counter';",
        '',
        '<Counter />',
        '',
        '<Counter>',
        '   ',
        '</Counter>',
      ].join('\n'),
    );

    expect(result.islands).toHaveLength(2);
    expect(result.html).not.toContain('wordma-island-slot');
    expect(result.islands.every((item) => !item.slotHtml)).toBe(
      true,
    );
  });

  it('props 中的 HTML 特殊字符被转义', async () => {
    const result = await renderWithIslands(
      [
        "import Counter from '../../components/counter';",
        '',
        '<Counter text={\'</script><img src=x onerror=alert(1)>\'} />',
      ].join('\n'),
    );

    expect(result.html).not.toContain('</script>');
    expect(result.html).not.toContain('<img');
    expect(result.html).toContain('\\u003c/script\\u003e');
    expect(result.html).toContain('&#x22;text&#x22;');
  });
});

describe('HTML JSX', () => {
  it('渲染小写标签、属性与 fragment', async () => {
    const result = await renderMdx(
      parseMdx(
        [
          '<div class="box" hidden>',
          '  <em>Hi</em>',
          '  <>',
          '    <span>there</span>',
          '  </>',
          '</div>',
        ].join('\n'),
        { filePath: islandsFile },
      ).tree,
      { filePath: islandsFile },
    );

    expect(result.html).toContain(
      '<div class="box" hidden><p><em>Hi</em></p><p><span>there</span></p></div>',
    );
  });

  it('HTML 中可以使用岛屿', async () => {
    const result = await renderWithIslands(
      [
        "import Counter from '../../components/counter';",
        '',
        '<div class="wrapper">',
        '  <Counter />',
        '</div>',
      ].join('\n'),
    );

    expect(result.html).toContain('class="wrapper"');
    expect(result.html).toContain('data-wordma-island="Counter"');
  });

  it('拒绝事件属性、危险标签与 innerHTML', async () => {
    await expectError(
      '<div onclick="alert(1)">x</div>',
      'UNSUPPORTED_MDX_JSX',
    );
    await expectError(
      '<script>alert(1)</script>',
      'UNSUPPORTED_MDX_JSX',
    );
    await expectError(
      '<div dangerouslySetInnerHTML={{ __html: \'<b>x</b>\' }} />',
      'UNSUPPORTED_MDX_JSX',
    );
  });
});

describe('岛屿 props 校验', () => {
  const counter = "import Counter from '../../components/counter';\n\n";

  it('拒绝函数、调用、标识符与展开', async () => {
    for (const source of [
      '<Counter onClick={() => 1} />',
      '<Counter value={1 + 1} />',
      '<Counter value={foo} />',
      '<Counter value={new Date()} />',
      '<Counter value={NaN} />',
      '<Counter {...props} />',
    ]) {
      const error = await expectError(
        `${counter}${source}`,
        'INVALID_ISLAND_PROPS',
      );

      expect(error.file).toBe(islandsFile);
    }
  });

  it('拒绝原型相关键', async () => {
    await expectError(
      `${counter}<Counter value={{ '__proto__': 1 }} />`,
      'INVALID_ISLAND_PROPS',
    );
  });

  it('props 超过 32 KB 报 PROPS_TOO_LARGE', async () => {
    const source = `${counter}<Counter text="${'a'.repeat(33_000)}" />`;

    await expectError(source, 'PROPS_TOO_LARGE');
  });
});
