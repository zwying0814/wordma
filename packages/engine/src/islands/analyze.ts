import type { Position } from 'unist';

import { MdxError } from '../errors';
import type { ParsedMdx } from '../mdx/parse';
import type { ResolvedMdxImport } from '../mdx/resolve';

export type IslandNode = {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: unknown[];
  children: unknown[];
  position?: Position;
};

export type IslandReference = {
  /** 原始 JSX 名，如 Counter 或 UI.Badge */
  name: string;
  /** import 的本地绑定名 */
  localName: string;
  /** 解析后的 import */
  import: ResolvedMdxImport;
  /** 成员表达式的属性路径，如 ['Badge'] */
  propertyPath: string[];
  line?: number;
  column?: number;
  /** mdast JSX 节点，供 props/children 阶段使用 */
  node: IslandNode;
};

type MdastLike = {
  type?: string;
  name?: string | null;
  attributes?: unknown[];
  children?: unknown[];
  position?: Position;
};

function isJsxElement(
  node: MdastLike,
): node is MdastLike & IslandNode {
  return (
    node.type === 'mdxJsxFlowElement' ||
    node.type === 'mdxJsxTextElement'
  );
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name.split('.')[0] ?? '');
}

function positionOf(
  node: IslandNode,
): { line?: number; column?: number } {
  return {
    line: node.position?.start?.line,
    column: node.position?.start?.column,
  };
}

function islandError(
  code: string,
  message: string,
  parsed: ParsedMdx,
  node: IslandNode,
): MdxError {
  const position = positionOf(node);

  return new MdxError(code, message, {
    file: parsed.filePath,
    line: position.line,
    column: position.column,
  });
}

/**
 * 识别 MDX 中引用的岛屿组件。
 *
 * - 小写标签视为 HTML，不下钻为岛屿
 * - 大写标签与成员表达式必须能解析到 import 绑定
 * - 岛屿 children 中出现岛屿时报 NESTED_ISLAND
 */
export function analyzeIslands(
  parsed: ParsedMdx,
  resolvedImports: ResolvedMdxImport[],
): IslandReference[] {
  const importsByLocal = new Map(
    resolvedImports.map((item) => [item.localName, item]),
  );
  const islands: IslandReference[] = [];

  function createReference(node: IslandNode): IslandReference {
    const name = node.name ?? '';
    const [localName = '', ...propertyPath] = name.split('.');
    const imported = importsByLocal.get(localName);

    if (!imported) {
      throw islandError(
        'MISSING_COMPONENT_IMPORT',
        `找不到组件 import：<${name}>`,
        parsed,
        node,
      );
    }

    const position = positionOf(node);

    return {
      name,
      localName,
      import: imported,
      propertyPath,
      line: position.line,
      column: position.column,
      node,
    };
  }

  function walk(
    node: MdastLike,
    parentIsland: IslandReference | undefined,
  ): void {
    if (isJsxElement(node)) {
      const name = node.name;
      const component =
        typeof name === 'string' && isComponentName(name)
          ? createReference(node)
          : undefined;

      if (component) {
        if (parentIsland) {
          throw islandError(
            'NESTED_ISLAND',
            `岛屿不能嵌套：<${parentIsland.name}> 内出现 <${component.name}>`,
            parsed,
            node,
          );
        }

        islands.push(component);
      }

      const childParent = component ?? parentIsland;

      for (const child of node.children) {
        if (child && typeof child === 'object') {
          walk(child as MdastLike, childParent);
        }
      }

      return;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object') {
          walk(child as MdastLike, parentIsland);
        }
      }
    }
  }

  walk(parsed.tree as MdastLike, undefined);

  return islands;
}
