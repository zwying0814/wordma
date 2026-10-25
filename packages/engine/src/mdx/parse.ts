import type { ImportDeclaration, Program } from 'estree-jsx';
import type { Root } from 'mdast';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Position } from 'unist';

import { MdxError } from '../errors';

export type MdxImport = {
  /** MDX 中的本地绑定名 */
  localName: string;
  /** 'default' 或具名导出名 */
  importedName: string;
  /** import 说明符原文 */
  source: string;
  line?: number;
  column?: number;
};

export type ParsedMdx = {
  filePath: string;
  tree: Root;
  imports: MdxImport[];
};

type MdxEsmNode = {
  type: 'mdxjsEsm';
  position?: Position;
  data?: {
    estree?: Program | null;
  };
};

const processor = unified().use(remarkParse).use(remarkMdx);

function startPosition(
  node: MdxEsmNode,
  declaration: {
    loc?: {
      start?: { line?: number; column?: number };
    } | null;
  },
): { line?: number; column?: number } {
  const start = declaration.loc?.start;

  if (start) {
    return {
      line: start.line,
      // ESTree 使用 0 基列号，统一为 1 基
      column:
        start.column === undefined
          ? undefined
          : start.column + 1,
    };
  }

  return {
    line: node.position?.start.line,
    column: node.position?.start.column,
  };
}

function importedName(
  specifier: ImportDeclaration['specifiers'][number],
): string | undefined {
  if (specifier.type === 'ImportDefaultSpecifier') {
    return 'default';
  }

  if (specifier.type === 'ImportSpecifier') {
    return specifier.imported.type === 'Identifier'
      ? specifier.imported.name
      : String(specifier.imported.value);
  }

  return undefined;
}

function collectImports(tree: Root, filePath: string): MdxImport[] {
  const imports: MdxImport[] = [];

  for (const child of tree.children) {
    if (child.type !== 'mdxjsEsm') continue;

    const node = child as unknown as MdxEsmNode;
    const program = node.data?.estree;
    if (!program) continue;

    for (const statement of program.body) {
      if (statement.type !== 'ImportDeclaration') {
        const location = startPosition(node, statement);
        throw new MdxError(
          'UNSUPPORTED_IMPORT',
          `MDX 只允许组件 import：${filePath}`,
          {
            file: filePath,
            line: location.line,
            column: location.column,
          },
        );
      }

      const location = startPosition(node, statement);

      if (statement.specifiers.length === 0) {
        throw new MdxError(
          'UNSUPPORTED_IMPORT',
          `不支持副作用 import：${statement.source.value}`,
          {
            file: filePath,
            line: location.line,
            column: location.column,
          },
        );
      }

      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          throw new MdxError(
            'UNSUPPORTED_IMPORT',
            `不支持命名空间 import：* as ${specifier.local.name}`,
            {
              file: filePath,
              line: location.line,
              column: location.column,
            },
          );
        }

        const name = importedName(specifier);
        if (!name) continue;

        imports.push({
          localName: specifier.local.name,
          importedName: name,
          source: String(statement.source.value),
          line: location.line,
          column: location.column,
        });
      }
    }
  }

  return imports;
}

function parseErrorMessage(
  error: unknown,
  filePath: string,
): { message: string; line?: number; column?: number } {
  if (error instanceof Error) {
    const detail = error as Error & {
      reason?: string;
      line?: number;
      column?: number;
      place?: {
        start?: { line?: number; column?: number };
      };
    };

    const line = detail.line ?? detail.place?.start?.line;
    const column = detail.column ?? detail.place?.start?.column;
    const reason = detail.reason ?? detail.message;
    const location =
      line === undefined
        ? ''
        : `:${line}${column === undefined ? '' : `:${column}`}`;

    return {
      message: `MDX 解析失败：${filePath}${location}\n${reason}`,
      line,
      column,
    };
  }

  return {
    message: `MDX 解析失败：${filePath}\n${String(error)}`,
  };
}

/**
 * 解析 MDX 源码为 mdast，只收集 import 声明，不执行任何内容代码。
 */
export function parseMdx(
  source: string,
  options: { filePath: string },
): ParsedMdx {
  const { filePath } = options;
  const input =
    source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  let tree: Root;

  try {
    tree = processor.parse(input.replace(/\r\n?/g, '\n')) as Root;
  } catch (error) {
    const detail = parseErrorMessage(error, filePath);

    throw new MdxError('MDX_PARSE_ERROR', detail.message, {
      file: filePath,
      line: detail.line,
      column: detail.column,
    });
  }

  return {
    filePath,
    tree,
    imports: collectImports(tree, filePath),
  };
}
