import type { Heading } from '@wordma/content';

import { analyzeIslands } from '../islands/analyze';
import type { IslandReference } from '../islands/analyze';
import {
  referenceIslandKey,
} from '../islands/identity';
import type { IslandAsset } from '../islands/identity';
import { parseMdx } from './parse';
import type { ParsedMdx } from './parse';
import { renderMdx } from './render';
import type { CompiledIsland } from './render';
import { resolveMdxImports } from './resolve';

export type AnalyzeMdxOptions = {
  filePath: string;
  workspaceRoot: string;
  /** 正文第一行之前的前置行数 */
  lineOffset?: number;
};

export type MdxAnalysis = {
  parsed: ParsedMdx;
  references: IslandReference[];
};

export type CompileMdxOptions = AnalyzeMdxOptions & {
  codeTheme?: string;
  /** 复用 analyzeMdx 的结果，避免重复解析 */
  analysis?: MdxAnalysis;
  /** 按 referenceIslandKey 查找已打包的岛屿资产 */
  islandAssets?: ReadonlyMap<string, IslandAsset>;
  /** 正文资源路径 → hash URL */
  resolveAsset?: (source: string) => string | undefined;
};

export type CompiledContent = {
  html: string;
  headings: Heading[];
  islands: CompiledIsland[];
  excerpt?: string;
};

/**
 * 解析 MDX 并解析组件 import，不生成 HTML。
 *
 * 构建阶段先分析所有正文，收集岛屿后再统一打包。
 */
export function analyzeMdx(
  source: string,
  options: AnalyzeMdxOptions,
): MdxAnalysis {
  const parsed = parseMdx(source, {
    filePath: options.filePath,
    lineOffset: options.lineOffset,
  });
  const imports = resolveMdxImports(parsed, {
    workspaceRoot: options.workspaceRoot,
  });

  return {
    parsed,
    references: analyzeIslands(parsed, imports),
  };
}

/**
 * 解析、分析并渲染一份 MDX 正文。
 *
 * 构建期只读取 mdast 与静态字面量，不执行内容或组件代码。
 */
export async function compileMdx(
  source: string,
  options: CompileMdxOptions,
): Promise<CompiledContent> {
  const analysis =
    options.analysis ??
    analyzeMdx(source, {
      filePath: options.filePath,
      workspaceRoot: options.workspaceRoot,
      lineOffset: options.lineOffset,
    });
  const rendered = await renderMdx(analysis.parsed.tree, {
    filePath: options.filePath,
    codeTheme: options.codeTheme,
    resolveAsset: options.resolveAsset,
    islands: analysis.references.map((reference) => {
      const asset = options.islandAssets?.get(
        referenceIslandKey(reference),
      );

      return {
        reference,
        js: asset?.js,
        css: asset?.css,
      };
    }),
  });

  return {
    html: rendered.html,
    headings: rendered.headings,
    islands: rendered.islands,
    excerpt: rendered.excerpt,
  };
}
