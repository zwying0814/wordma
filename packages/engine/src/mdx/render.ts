import rehypeShiki from '@shikijs/rehype';
import type { Heading as ContentHeading } from '@wordma/content';
import { toHtml } from 'hast-util-to-html';
import type { Element, Nodes, Root as HastRoot } from 'hast';
import type { Paragraph, Root as MdastRoot } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { MdxError } from '../errors';

export type RenderMdxOptions = {
  filePath?: string;
  /** Shiki 主题，默认 github-light */
  codeTheme?: string;
};

export type RenderedMdx = {
  html: string;
  headings: ContentHeading[];
  excerpt?: string;
};

const HEADING_DEPTHS = new Set([1, 2, 3, 4, 5, 6]);
const EXCERPT_LENGTH = 160;

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

/**
 * 把已解析的 MDX mdast 渲染为静态 HTML。
 *
 * ESM 声明被忽略；表达式与 JSX 在 M3.3/M3.4 接入前显式报错。
 */
export async function renderMdx(
  tree: MdastRoot,
  options: RenderMdxOptions = {},
): Promise<RenderedMdx> {
  const processor = unified()
    .use(remarkRehype, {
      handlers: {
        mdxjsEsm: () => undefined,
        mdxFlowExpression: (_state, node) => {
          throw mdxError(
            'UNSUPPORTED_EXPRESSION',
            'MDX 表达式暂不支持',
            options,
            node,
          );
        },
        mdxTextExpression: (_state, node) => {
          throw mdxError(
            'UNSUPPORTED_EXPRESSION',
            'MDX 表达式暂不支持',
            options,
            node,
          );
        },
        mdxJsxFlowElement: (_state, node) => {
          throw mdxError(
            'UNSUPPORTED_MDX_JSX',
            'MDX JSX 渲染尚未接入',
            options,
            node,
          );
        },
        mdxJsxTextElement: (_state, node) => {
          throw mdxError(
            'UNSUPPORTED_MDX_JSX',
            'MDX JSX 渲染尚未接入',
            options,
            node,
          );
        },
      },
    })
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

  return {
    html: toHtml(hast),
    headings: collectHeadings(hast),
    excerpt: extractExcerpt(tree),
  };
}
