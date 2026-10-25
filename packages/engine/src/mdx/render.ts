import rehypeShiki from '@shikijs/rehype';
import type { Heading as ContentHeading } from '@wordma/content';
import { toHtml } from 'hast-util-to-html';
import type {
  Element,
  ElementContent,
  Nodes,
  Properties,
  Root as HastRoot,
} from 'hast';
import type { Paragraph, Root as MdastRoot } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkRehype from 'remark-rehype';
import type { Options as RemarkRehypeOptions } from 'remark-rehype';
import { unified } from 'unified';
import type { Position } from 'unist';
import { visit } from 'unist-util-visit';

import { MdxError } from '../errors';
import type { IslandReference } from '../islands/analyze';
import { islandExportName } from '../islands/identity';
import {
  evaluateJsxAttributes,
  serializeIslandProps,
} from '../islands/props';
import type { JsonValue } from '../islands/props';

export type IslandRenderInput = {
  reference: IslandReference;
  js?: string;
  css?: string;
};

export type CompiledIsland = {
  name: string;
  /** 组件绝对路径 */
  source: string;
  /** workspace 相对路径（POSIX） */
  relativeSource: string;
  /** default、具名导出或带属性路径的展示名 */
  exportName: string;
  importedName: string;
  propertyPath: string[];
  props: Record<string, JsonValue>;
  propsJson: string;
  slotHtml?: string;
  js?: string;
  css?: string;
  line?: number;
  column?: number;
};

export type RenderMdxOptions = {
  filePath?: string;
  /** Shiki 主题，默认 github-light */
  codeTheme?: string;
  /** 由 analyzeIslands 得到的岛屿，附带已打包资产 */
  islands?: IslandRenderInput[];
  /** 把正文中的相对资源路径解析为 hash URL */
  resolveAsset?: (source: string) => string | undefined;
};

export type RenderedMdx = {
  html: string;
  headings: ContentHeading[];
  excerpt?: string;
  islands: CompiledIsland[];
};

type JsxNode = {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: unknown[];
  children: unknown[];
  position?: Position;
};

type PreparedIsland = {
  compiled: CompiledIsland;
  propsJson: string;
  slotHtml?: string;
};

type RehypeState = {
  all: (node: unknown) => ElementContent[];
};

type MdxProcessor = ReturnType<typeof createProcessor>;

const HEADING_DEPTHS = new Set([1, 2, 3, 4, 5, 6]);
const EXCERPT_LENGTH = 160;
const UNSAFE_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'noscript',
]);

function mdxError(
  code: string,
  message: string,
  options: RenderMdxOptions,
  node: { position?: { start?: { line?: number; column?: number } } },
): MdxError {
  return new MdxError(code, message, {
    file: options.filePath,
    line: node.position?.start?.line,
    column: node.position?.start?.column,
  });
}

function textContent(node: Nodes): string {
  if (node.type === 'text') return node.value;

  if (node.type === 'element') {
    const classes = node.properties.className;
    if (
      Array.isArray(classes) &&
      classes.includes('heading-anchor')
    ) {
      return '';
    }

    return node.children.map(textContent).join('');
  }

  return '';
}

function collectHeadings(tree: HastRoot): ContentHeading[] {
  const headings: ContentHeading[] = [];

  visit(tree, 'element', (node: Element) => {
    if (!/^h[1-6]$/.test(node.tagName)) return;

    const depth = Number(node.tagName.slice(1));
    if (!HEADING_DEPTHS.has(depth)) return;

    headings.push({
      id:
        typeof node.properties.id === 'string'
          ? node.properties.id
          : '',
      text: textContent(node).trim(),
      depth: depth as ContentHeading['depth'],
    });
  });

  return headings;
}

function extractExcerpt(tree: MdastRoot): string | undefined {
  const paragraph = tree.children.find(
    (node): node is Paragraph => node.type === 'paragraph',
  );
  if (!paragraph) return undefined;

  const text = mdastToString(paragraph)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;

  const characters = Array.from(text);

  return characters.length > EXCERPT_LENGTH
    ? `${characters.slice(0, EXCERPT_LENGTH - 1).join('')}…`
    : text;
}

function isKatexError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'ParseError' ||
      error.message.includes('KaTeX'))
  );
}

function findKatexError(tree: HastRoot): Element | undefined {
  let error: Element | undefined;

  visit(tree, 'element', (node: Element) => {
    if (error) return;

    const classes = node.properties.className;
    if (
      Array.isArray(classes) &&
      classes.includes('katex-error')
    ) {
      error = node;
    }
  });

  return error;
}

function rewriteAssetUrls(
  tree: HastRoot,
  resolveAsset: ((source: string) => string | undefined) | undefined,
): void {
  if (!resolveAsset) return;

  visit(tree, 'element', (node: Element) => {
    const attribute =
      node.tagName === 'a'
        ? 'href'
        : node.tagName === 'img' ||
            node.tagName === 'source' ||
            node.tagName === 'video' ||
            node.tagName === 'audio' ||
            node.tagName === 'track'
          ? 'src'
          : undefined;

    if (!attribute) return;

    const value = node.properties[attribute];
    if (typeof value !== 'string') return;

    const resolved = resolveAsset(value);
    if (resolved) {
      node.properties[attribute] = resolved;
    }
  });
}

async function runProcessor(
  processor: MdxProcessor,
  tree: MdastRoot,
  options: RenderMdxOptions,
): Promise<HastRoot> {
  let hast: HastRoot;

  try {
    hast = (await processor.run(tree)) as HastRoot;
  } catch (error) {
    if (isKatexError(error)) {
      throw new MdxError(
        'MATH_RENDER_FAILED',
        `数学公式渲染失败：${error instanceof Error ? error.message : String(error)}`,
        { file: options.filePath },
      );
    }

    throw error;
  }

  const katexError = findKatexError(hast);
  if (katexError) {
    const detail = katexError.properties.title;

    throw new MdxError(
      'MATH_RENDER_FAILED',
      `数学公式渲染失败：${String(detail ?? 'KaTeX error')}`,
      { file: options.filePath },
    );
  }

  return hast;
}

function hasSlotContent(children: unknown[]): boolean {
  for (const raw of children) {
    if (!raw || typeof raw !== 'object') continue;

    const node = raw as {
      type?: string;
      value?: unknown;
      children?: unknown[];
    };

    if (node.type === 'text') {
      if (
        typeof node.value === 'string' &&
        node.value.trim().length > 0
      ) {
        return true;
      }
      continue;
    }

    return true;
  }

  return false;
}

async function renderSlot(
  children: unknown[],
  options: RenderMdxOptions,
): Promise<string | undefined> {
  if (!hasSlotContent(children)) return undefined;

  const tree = {
    type: 'root',
    children,
  } as unknown as MdastRoot;
  const processor = createProcessor(options, new Map());
  const hast = await runProcessor(processor, tree, options);
  const html = toHtml(hast, {
    allowDangerousHtml: true,
  }).trim();

  return html || undefined;
}

async function prepareIslands(
  inputs: IslandRenderInput[],
  options: RenderMdxOptions,
): Promise<Map<JsxNode, PreparedIsland>> {
  const prepared = new Map<JsxNode, PreparedIsland>();

  for (const input of inputs) {
    const { reference } = input;
    const node = reference.node as unknown as JsxNode;
    const context = {
      filePath: options.filePath,
      node,
    };
    const { props } = evaluateJsxAttributes(
      node.attributes,
      context,
    );
    const propsJson = serializeIslandProps(props, context);
    const slotHtml = await renderSlot(
      node.children,
      options,
    );
    const compiled: CompiledIsland = {
      name: reference.name,
      source: reference.import.filePath,
      relativeSource: reference.import.relativePath,
      exportName: islandExportName(reference),
      importedName: reference.import.importedName,
      propertyPath: [...reference.propertyPath],
      props,
      propsJson,
      slotHtml,
      js: input.js,
      css: input.css,
      line: reference.line,
      column: reference.column,
    };

    prepared.set(node, {
      compiled,
      propsJson,
      slotHtml,
    });
  }

  return prepared;
}

function toHastPropertyName(name: string): string {
  if (name === 'class') return 'className';
  if (name === 'for') return 'htmlFor';
  return name;
}

function toHastPropertyValue(
  value: JsonValue,
): Properties[string] {
  if (Array.isArray(value)) {
    return value.map(String).join(' ');
  }

  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}

function renderHtmlJsx(
  state: RehypeState,
  node: JsxNode,
  options: RenderMdxOptions,
): Element {
  const name = node.name ?? '';

  if (UNSAFE_TAGS.has(name)) {
    throw mdxError(
      'UNSUPPORTED_MDX_JSX',
      `不允许的 HTML 标签：<${name}>`,
      options,
      node,
    );
  }

  const { props } = evaluateJsxAttributes(node.attributes, {
    filePath: options.filePath,
    node,
  });
  const properties: Properties = {};

  for (const [key, value] of Object.entries(props)) {
    if (/^on/i.test(key) || key === 'dangerouslySetInnerHTML') {
      throw mdxError(
        'UNSUPPORTED_MDX_JSX',
        `不允许的属性：${key}`,
        options,
        node,
      );
    }

    properties[toHastPropertyName(key)] =
      toHastPropertyValue(value);
  }

  return {
    type: 'element',
    tagName: name,
    properties,
    children: state.all(node),
  };
}

function renderIslandPlaceholder(
  prepared: PreparedIsland,
): Element {
  const { compiled, propsJson, slotHtml } = prepared;
  const children: ElementContent[] = [];

  if (slotHtml) {
    children.push({
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['wordma-island-slot'],
        style: 'display:contents',
        'data-wordma-slot': '',
      },
      children: [
        {
          type: 'raw',
          value: slotHtml,
        } as unknown as ElementContent,
      ],
    });
  }

  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['wordma-island'],
      'data-wordma-island': compiled.name,
      'data-wordma-export': compiled.exportName,
      'data-wordma-props': propsJson,
      ...(compiled.js
        ? { 'data-wordma-src': compiled.js }
        : {}),
    },
    children,
  };
}

function renderJsx(
  state: RehypeState,
  rawNode: unknown,
  options: RenderMdxOptions,
  prepared: Map<JsxNode, PreparedIsland>,
): Element | ElementContent[] {
  const node = rawNode as JsxNode;
  const name = node.name;

  if (name === null) {
    return state.all(node);
  }

  if (/^[a-z]/.test(name)) {
    return renderHtmlJsx(state, node, options);
  }

  const island = prepared.get(node);
  if (!island) {
    throw mdxError(
      'UNSUPPORTED_MDX_JSX',
      `MDX 组件尚未接入：<${name}>`,
      options,
      node,
    );
  }

  return renderIslandPlaceholder(island);
}

function createProcessor(
  options: RenderMdxOptions,
  prepared: Map<JsxNode, PreparedIsland>,
) {
  const unsupportedExpression = (
    _state: RehypeState,
    node: { position?: Position },
  ): never => {
    throw mdxError(
      'UNSUPPORTED_EXPRESSION',
      'MDX 表达式暂不支持',
      options,
      node,
    );
  };

  const handlers = {
    mdxjsEsm: () => undefined,
    mdxFlowExpression: unsupportedExpression,
    mdxTextExpression: unsupportedExpression,
    mdxJsxFlowElement: (state: unknown, node: unknown) =>
      renderJsx(
        state as RehypeState,
        node,
        options,
        prepared,
      ),
    mdxJsxTextElement: (state: unknown, node: unknown) =>
      renderJsx(
        state as RehypeState,
        node,
        options,
        prepared,
      ),
  } as RemarkRehypeOptions['handlers'];
  const rehypeOptions: RemarkRehypeOptions = { handlers };

  return unified()
    .use(remarkRehype, rehypeOptions)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: {
        className: ['heading-anchor'],
        ariaLabel: '链接到此标题',
      },
      content: {
        type: 'element',
        tagName: 'span',
        properties: { ariaHidden: 'true' },
        children: [{ type: 'text', value: '#' }],
      },
    })
    .use(rehypeKatex)
    .use(rehypeShiki, {
      theme: options.codeTheme ?? 'github-light',
      fallbackLanguage: 'text',
    });
}

/**
 * 把已解析的 MDX mdast 渲染为静态 HTML。
 *
 * 岛屿输出占位符、JSON props 与 children slot；组件代码不会在构建期执行。
 */
export async function renderMdx(
  tree: MdastRoot,
  options: RenderMdxOptions = {},
): Promise<RenderedMdx> {
  const prepared = await prepareIslands(
    options.islands ?? [],
    options,
  );
  const processor = createProcessor(options, prepared);
  const hast = await runProcessor(
    processor,
    tree,
    options,
  );
  rewriteAssetUrls(hast, options.resolveAsset);

  return {
    html: toHtml(hast, { allowDangerousHtml: true }),
    headings: collectHeadings(hast),
    excerpt: extractExcerpt(tree),
    islands: [...prepared.values()].map(
      (item) => item.compiled,
    ),
  };
}
