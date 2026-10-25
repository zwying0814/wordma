import { readFileSync } from 'node:fs';

import { ZodError } from 'zod';

import { ContentError } from './diagnostics';
import { parsePageFrontmatter } from './schema/content';
import type { PageFrontmatter } from './types/content';
import { YamlParseError, parseYaml } from './yaml/parse';

export type SplitFrontmatterResult = {
  /** frontmatter 原文，不含分隔符 */
  data: string;
  /** 去掉 frontmatter 的正文，换行统一为 LF */
  body: string;
};

export type ParsedContentFile = {
  frontmatter: PageFrontmatter;
  body: string;
};

function formatIssue(error: unknown): string {
  if (error instanceof YamlParseError) {
    return error.diagnostics
      .map(
        (diagnostic) =>
          `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}`,
      )
      .join('\n');
  }

  if (error instanceof ZodError) {
    return error.issues
      .map(
        (issue) =>
          `- ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}

/**
 * 拆分文件开头的 YAML frontmatter。
 *
 * - 支持 UTF-8 BOM
 * - 支持 LF / CRLF
 * - 允许空 frontmatter（后续 schema 校验会拒绝缺少 title）
 */
export function splitFrontmatter(
  source: string,
  filePath: string,
): SplitFrontmatterResult {
  const input =
    source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const lines = input.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') {
    throw new ContentError(
      'MISSING_FRONTMATTER',
      `缺少 frontmatter：${filePath}`,
      { file: filePath },
    );
  }

  const closeIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );

  if (closeIndex === -1) {
    throw new ContentError(
      'INVALID_FRONTMATTER',
      `frontmatter 未闭合：${filePath}`,
      { file: filePath },
    );
  }

  return {
    data: lines.slice(1, closeIndex).join('\n'),
    body: lines.slice(closeIndex + 1).join('\n'),
  };
}

export function parseContentFile(
  source: string,
  filePath: string,
): ParsedContentFile {
  const { data, body } = splitFrontmatter(source, filePath);

  try {
    const parsed = parseYaml(data, { filePath });
    const frontmatter = parsePageFrontmatter(parsed);

    return { frontmatter, body };
  } catch (error) {
    if (error instanceof ContentError) throw error;

    throw new ContentError(
      'INVALID_FRONTMATTER',
      `frontmatter 无效：${filePath}\n${formatIssue(error)}`,
      { file: filePath },
    );
  }
}

export function readContentFile(filePath: string): ParsedContentFile {
  return parseContentFile(readFileSync(filePath, 'utf8'), filePath);
}

/**
 * 将 frontmatter 的主题命名空间放入 PageMeta.data。
 * M1.3 构建 ContentEntry 时使用。
 */
export function frontmatterToPageData(
  frontmatter: PageFrontmatter,
): Record<string, unknown> {
  return {
    theme: frontmatter.theme ?? {},
  };
}
