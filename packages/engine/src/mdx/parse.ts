import type { ImportDeclaration, Program } from 'estree-jsx';
import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
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

export type ParseMdxOptions = {
  filePath: string;
  /** 正文第一行之前的前置行数，用于把正文行号还原为文件行号 */
  lineOffset?: number;
};

type MdxEsmNode = {
  type: 'mdxjsEsm';
  position?: Position;
  data?: {
    estree?: Program | null;
  };
};

const processor = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkGfm)
  .use(remarkMath);

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
  lineOffset: number,
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

    const rawLine = detail.line ?? detail.place?.start?.line;
    const line =
      rawLine === undefined
        ? undefined
        : rawLine + lineOffset;
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

function shiftPositions(
  node: unknown,
  offset: number,
  visited: Set<object>,
): void {
  if (offset === 0 || !node || typeof node !== 'object') {
    return;
  }
  if (visited.has(node)) return;
  visited.add(node);

  const value = node as {
    position?: {
      start?: { line?: number };
      end?: { line?: number };
    };
    children?: unknown[];
    attributes?: unknown[];
  };

  if (value.position?.start?.line !== undefined) {
    value.position.start.line += offset;
  }
  if (value.position?.end?.line !== undefined) {
    value.position.end.line += offset;
  }

  if (Array.isArray(value.children)) {
    for (const child of value.children) {
      shiftPositions(child, offset, visited);
    }
  }

  if (Array.isArray(value.attributes)) {
    for (const attribute of value.attributes) {
      shiftPositions(attribute, offset, visited);
    }
  }
}

function shiftEsmLocations(tree: Root, offset: number): void {
  if (offset === 0) return;

  for (const child of tree.children) {
    if (child.type !== 'mdxjsEsm') continue;

    const program = (child as unknown as MdxEsmNode)
      .data?.estree;
    if (!program) continue;

    for (const statement of program.body) {
      const loc = (
        statement as {
          loc?: {
            start?: { line?: number };
            end?: { line?: number };
          };
        }
      ).loc;

      if (loc?.start?.line !== undefined) {
        loc.start.line += offset;
      }
      if (loc?.end?.line !== undefined) {
        loc.end.line += offset;
      }
    }
  }
}

/**
 * 解析 MDX 源码为 mdast，只收集 import 声明，不执行任何内容代码。
 */
export function parseMdx(
  source: string,
  options: ParseMdxOptions,
): ParsedMdx {
  const { filePath } = options;
  const lineOffset = Math.max(0, options.lineOffset ?? 0);
  const input =
    source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  let tree: Root;

  try {
    tree = processor.parse(input.replace(/\r\n?/g, '\n')) as Root;
  } catch (error) {
    const detail = parseErrorMessage(
      error,
      filePath,
      lineOffset,
    );

    throw new MdxError('MDX_PARSE_ERROR', detail.message, {
      file: filePath,
      line: detail.line,
      column: detail.column,
    });
  }

  shiftPositions(tree, lineOffset, new Set());
  shiftEsmLocations(tree, lineOffset);

  return {
    filePath,
    tree,
    imports: collectImports(tree, filePath),
  };
}
