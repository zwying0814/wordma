import { describe, expect, it } from 'bun:test';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import { MdxError } from '../errors';
import { parseMdx } from './parse';
import { resolveMdxImports } from './resolve';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const islandsRoot = path.join(repoRoot, 'fixtures/islands');
const islandsFile = path.join(
  islandsRoot,
  'content/posts/islands.mdx',
);

function expectMdxError(
  run: () => unknown,
  code: string,
): MdxError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MdxError);
    expect((error as MdxError).code).toBe(code);
    return error as MdxError;
  }

  throw new Error(`预期抛出 MdxError(${code})`);
}

describe('parseMdx', () => {
  it('解析 mdast 并收集默认、具名与别名 import', () => {
    const parsed = parseMdx(
      [
        "import Counter from '../../components/counter';",
        "import { Note as Callout } from '../../components/note';",
        '',
        '# Islands',
      ].join('\n'),
      { filePath: islandsFile },
    );

    expect(parsed.tree.type).toBe('root');
    expect(parsed.imports).toEqual([
      {
        localName: 'Counter',
        importedName: 'default',
        source: '../../components/counter',
        line: 1,
        column: 1,
      },
      {
        localName: 'Callout',
        importedName: 'Note',
        source: '../../components/note',
        line: 2,
        column: 1,
      },
    ]);
  });

  it('支持 BOM 与 CRLF', () => {
    const parsed = parseMdx(
      "﻿import Counter from './counter';\r\n\r\n# Hi\r\n",
      { filePath: islandsFile },
    );

    expect(parsed.imports).toHaveLength(1);
    expect(parsed.imports[0]?.source).toBe('./counter');
  });

  it('拒绝命名空间 import', () => {
    const error = expectMdxError(
      () =>
        parseMdx("import * as Counter from './counter';", {
          filePath: islandsFile,
        }),
      'UNSUPPORTED_IMPORT',
    );

    expect(error.file).toBe(islandsFile);
    expect(error.line).toBe(1);
    expect(error.message).toContain('命名空间');
  });

  it('拒绝 export 与副作用 import', () => {
    expectMdxError(
      () =>
        parseMdx('export const meta = 1;', {
          filePath: islandsFile,
        }),
      'UNSUPPORTED_IMPORT',
    );

    expectMdxError(
      () =>
        parseMdx("import './styles.css';", {
          filePath: islandsFile,
        }),
      'UNSUPPORTED_IMPORT',
    );
  });

  it('解析错误带文件与行列号', () => {
    const error = expectMdxError(
      () =>
        parseMdx('# Hi\n\n<Counter', {
          filePath: islandsFile,
        }),
      'MDX_PARSE_ERROR',
    );

    expect(error.file).toBe(islandsFile);
    expect(error.line).toBeGreaterThan(0);
    expect(error.column).toBeGreaterThan(0);
    expect(error.message).toContain('MDX 解析失败');
  });
});

describe('resolveMdxImports', () => {
  it('解析相对 import 并补全扩展名', () => {
    const parsed = parseMdx(
      [
        "import Counter from '../../components/counter';",
        "import { Note } from '../../components/note.tsx';",
      ].join('\n'),
      { filePath: islandsFile },
    );
    const resolved = resolveMdxImports(parsed, {
      workspaceRoot: islandsRoot,
    });

    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.relativePath).toBe(
      'components/counter.tsx',
    );
    expect(resolved[0]?.extension).toBe('.tsx');
    expect(resolved[0]?.filePath).toBe(
      realpathSync(
        path.join(islandsRoot, 'components/counter.tsx'),
      ),
    );
    expect(resolved[1]?.importedName).toBe('Note');
  });

  it('解析 workspace 内的裸包 import', () => {
    const parsed = parseMdx("import { parse } from 'yaml';", {
      filePath: islandsFile,
    });
    const resolved = resolveMdxImports(parsed, {
      workspaceRoot: repoRoot,
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.relativePath).toStartWith(
      'node_modules/.pnpm/yaml@',
    );
  });

  it('拒绝 Node 内置模块与绝对路径', () => {
    for (const source of [
      'node:fs',
      'fs',
      'bun:test',
    ]) {
      const parsed = parseMdx(
        `import value from '${source}';`,
        { filePath: islandsFile },
      );

      expectMdxError(
        () =>
          resolveMdxImports(parsed, {
            workspaceRoot: islandsRoot,
          }),
        'UNSAFE_IMPORT',
      );
    }

    const absolute = parseMdx('import value from "/tmp/x.tsx";', {
      filePath: islandsFile,
    });

    expectMdxError(
      () =>
        resolveMdxImports(absolute, {
          workspaceRoot: islandsRoot,
        }),
      'UNSAFE_IMPORT',
    );
  });

  it('拒绝逃出 workspace 的相对路径', () => {
    const parsed = parseMdx(
      "import value from '../../../../outside';",
      { filePath: islandsFile },
    );

    expectMdxError(
      () =>
        resolveMdxImports(parsed, {
          workspaceRoot: islandsRoot,
        }),
      'UNSAFE_IMPORT',
    );
  });

  it('拒绝缺失组件与不支持的扩展名', () => {
    const missing = parseMdx(
      "import value from '../../components/missing';",
      { filePath: islandsFile },
    );

    expectMdxError(
      () =>
        resolveMdxImports(missing, {
          workspaceRoot: islandsRoot,
        }),
      'MISSING_COMPONENT_SOURCE',
    );

    const json = parseMdx("import value from '../../package.json';", {
      filePath: islandsFile,
    });

    expectMdxError(
      () =>
        resolveMdxImports(json, {
          workspaceRoot: islandsRoot,
        }),
      'UNSUPPORTED_IMPORT',
    );
  });

  it('解析失败时保留 import 位置', () => {
    const parsed = parseMdx(
      '\n\nimport value from "./missing";',
      { filePath: islandsFile },
    );
    const error = expectMdxError(
      () =>
        resolveMdxImports(parsed, {
          workspaceRoot: islandsRoot,
        }),
      'MISSING_COMPONENT_SOURCE',
    );

    expect(error.line).toBe(3);
    expect(error.column).toBe(1);
  });
});
