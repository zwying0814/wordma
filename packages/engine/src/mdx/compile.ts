import type { Heading } from '@wordma/content';

import { analyzeIslands } from '../islands/analyze';
import { parseMdx } from './parse';
import { renderMdx } from './render';
import type { CompiledIsland } from './render';
import { resolveMdxImports } from './resolve';

export type CompileMdxOptions = {
  /** MDX 文件绝对路径 */
  filePath: string;
  /** 工作区根目录，用于 import 边界校验 */
  workspaceRoot: string;
  codeTheme?: string;
};

export type CompiledContent = {
  html: string;
  headings: Heading[];
  islands: CompiledIsland[];
  excerpt?: string;
};

/**
 * 解析、分析并渲染一份 MDX 正文。
 *
 * 构建期只读取 mdast 与静态字面量，不执行内容或组件代码。
 */
export async function compileMdx(
  source: string,
  options: CompileMdxOptions,
): Promise<CompiledContent> {
  const parsed = parseMdx(source, {
    filePath: options.filePath,
  });
  const imports = resolveMdxImports(parsed, {
    workspaceRoot: options.workspaceRoot,
  });
  const references = analyzeIslands(parsed, imports);
  const rendered = await renderMdx(parsed.tree, {
    filePath: options.filePath,
    codeTheme: options.codeTheme,
    islands: references.map((reference) => ({ reference })),
  });

  return {
    html: rendered.html,
    headings: rendered.headings,
    islands: rendered.islands,
    excerpt: rendered.excerpt,
  };
}
