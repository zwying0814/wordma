import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import { MdxError } from '../errors';
import { parseMdx } from '../mdx/parse';
import { resolveMdxImports } from '../mdx/resolve';
import { analyzeIslands } from './analyze';
import type { IslandReference } from './analyze';

const islandsRoot = path.resolve(
  import.meta.dirname,
  '../../../../fixtures/islands',
);
const islandsFile = path.join(
  islandsRoot,
  'content/posts/islands.mdx',
);

function analyze(source: string): IslandReference[] {
  const parsed = parseMdx(source, { filePath: islandsFile });
  const imports = resolveMdxImports(parsed, {
    workspaceRoot: islandsRoot,
  });

  return analyzeIslands(parsed, imports);
}

function expectMdxError(
  source: string,
  code: string,
): MdxError {
  try {
    analyze(source);
  } catch (error) {
    expect(error).toBeInstanceOf(MdxError);
    expect((error as MdxError).code).toBe(code);
    return error as MdxError;
  }

  throw new Error(`预期抛出 MdxError(${code})`);
}

describe('analyzeIslands', () => {
  it('识别默认、具名与别名 import 的岛屿', () => {
    const islands = analyze(
      [
        "import Counter from '../../components/counter';",
        "import { Note as Callout } from '../../components/note';",
        '',
        '# Islands',
        '',
        '<Counter />',
        '<Callout>Hello</Callout>',
        '<Counter />',
      ].join('\n'),
    );

    expect(islands).toHaveLength(3);
    expect(islands[0]).toMatchObject({
      name: 'Counter',
      localName: 'Counter',
      propertyPath: [],
    });
    expect(islands[0]?.import.importedName).toBe('default');
    expect(islands[0]?.import.relativePath).toBe(
      'components/counter.tsx',
    );
    expect(islands[1]).toMatchObject({
      name: 'Callout',
      localName: 'Callout',
      propertyPath: [],
    });
    expect(islands[1]?.import.importedName).toBe('Note');
    expect(islands[2]?.name).toBe('Counter');
  });

  it('支持成员表达式', () => {
    const islands = analyze(
      [
        "import UI from '../../components/note';",
        '',
        '<UI.Badge />',
        '<UI.Icon.Label />',
      ].join('\n'),
    );

    expect(islands).toHaveLength(2);
    expect(islands[0]).toMatchObject({
      name: 'UI.Badge',
      localName: 'UI',
      propertyPath: ['Badge'],
    });
    expect(islands[1]).toMatchObject({
      name: 'UI.Icon.Label',
      propertyPath: ['Icon', 'Label'],
    });
    expect(islands[1]?.import.importedName).toBe('default');
  });

  it('支持具名 import 的成员表达式', () => {
    const islands = analyze(
      [
        "import { Note as UI } from '../../components/note';",
        '',
        '<UI.Badge />',
      ].join('\n'),
    );

    expect(islands[0]?.import.importedName).toBe('Note');
    expect(islands[0]?.propertyPath).toEqual(['Badge']);
  });

  it('小写标签、自定义元素与 fragment 不是岛屿', () => {
    const islands = analyze(
      [
        '<div>',
        '  <aside>plain</aside>',
        '  <my-widget />',
        '  <>',
        '    <span>text</span>',
        '  </>',
        '</div>',
      ].join('\n'),
    );

    expect(islands).toEqual([]);
  });

  it('未使用的 import 不产生岛屿', () => {
    const islands = analyze(
      [
        "import Counter from '../../components/counter';",
        "import { Note } from '../../components/note';",
        '',
        '<Counter />',
      ].join('\n'),
    );

    expect(islands).toHaveLength(1);
    expect(islands[0]?.localName).toBe('Counter');
  });

  it('未知组件报 MISSING_COMPONENT_IMPORT', () => {
    const error = expectMdxError(
      '\n\n<Missing />',
      'MISSING_COMPONENT_IMPORT',
    );

    expect(error.file).toBe(islandsFile);
    expect(error.line).toBe(3);
    expect(error.column).toBe(1);
    expect(error.message).toContain('<Missing>');

    expectMdxError('<UI.Badge />', 'MISSING_COMPONENT_IMPORT');
  });

  it('HTML 中的岛屿不算嵌套', () => {
    const islands = analyze(
      [
        "import Counter from '../../components/counter';",
        '',
        '<div>',
        '  <Counter />',
        '</div>',
      ].join('\n'),
    );

    expect(islands).toHaveLength(1);
    expect(islands[0]?.name).toBe('Counter');
  });

  it('岛屿嵌套报 NESTED_ISLAND', () => {
    const error = expectMdxError(
      [
        "import Counter from '../../components/counter';",
        "import { Note } from '../../components/note';",
        '',
        '<Counter>',
        '  <div>',
        '    <Note>nested</Note>',
        '  </div>',
        '</Counter>',
      ].join('\n'),
      'NESTED_ISLAND',
    );

    expect(error.line).toBe(6);
    expect(error.message).toContain('<Counter>');
    expect(error.message).toContain('<Note>');
  });

  it('识别行内 JSX 岛屿', () => {
    const islands = analyze(
      [
        "import Counter from '../../components/counter';",
        '',
        'Before <Counter /> after',
      ].join('\n'),
    );

    expect(islands).toHaveLength(1);
    expect(islands[0]?.node.type).toBe('mdxJsxTextElement');
    expect(islands[0]?.line).toBe(3);
  });
});
