import { readFileSync } from 'node:fs';

import { parseDocument } from 'yaml';

const DEFAULT_MAX_ALIAS_COUNT = 50;
const INPUT_FILE = '<input>';

export type YamlDiagnostic = {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
};

export class YamlParseError extends Error {
  readonly diagnostics: YamlDiagnostic[];

  constructor(diagnostics: YamlDiagnostic[]) {
    super(
      diagnostics
        .map(
          (diagnostic) =>
            `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
        )
        .join('\n'),
    );
    this.name = 'YamlParseError';
    this.diagnostics = diagnostics;
  }
}

type YamlIssue = {
  code?: string;
  message: string;
  linePos?: Array<{ line: number; col: number }>;
};

export type ParseYamlOptions = {
  filePath?: string;
  maxAliasCount?: number;
};

function toDiagnostic(
  issue: YamlIssue,
  file: string,
  code?: string,
): YamlDiagnostic {
  return {
    file,
    line: issue.linePos?.[0]?.line ?? 1,
    column: issue.linePos?.[0]?.col ?? 1,
    code: code ?? issue.code ?? 'YAML_SYNTAX',
    message: issue.message,
  };
}

/**
 * 安全解析 YAML 1.2。
 *
 * 规则：
 * - 使用 core schema，避免 yes/no 被解析成布尔、日期被解析成 Date
 * - 重复 key 直接报错
 * - 自定义 tag 视为错误
 * - alias 展开数量有上限，防止资源耗尽
 */
export function parseYaml(
  source: string,
  options: ParseYamlOptions = {},
): unknown {
  const file = options.filePath ?? INPUT_FILE;
  const maxAliasCount = options.maxAliasCount ?? DEFAULT_MAX_ALIAS_COUNT;

  const document = parseDocument(source, {
    schema: 'core',
    version: '1.2',
    strict: true,
    uniqueKeys: true,
    prettyErrors: true,
  });

  const diagnostics: YamlDiagnostic[] = document.errors.map((error) =>
    toDiagnostic(error, file),
  );

  for (const warning of document.warnings) {
    const code = warning.code as string;
    if (code === 'TAG_RESOLVE_FAILED' || code === 'TAG_UNRESOLVED') {
      diagnostics.push(toDiagnostic(warning, file, 'CUSTOM_TAG'));
    }
  }

  if (diagnostics.length > 0) {
    throw new YamlParseError(diagnostics);
  }

  try {
    return document.toJS({ maxAliasCount }) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /alias count/i.test(message) ? 'ALIAS_LIMIT' : 'YAML_TO_JS';
    throw new YamlParseError([
      {
        file,
        line: 1,
        column: 1,
        code,
        message,
      },
    ]);
  }
}

export function parseYamlFile<T = unknown>(
  filePath: string,
  options: Omit<ParseYamlOptions, 'filePath'> = {},
): T {
  const source = readFileSync(filePath, 'utf8');
  return parseYaml(source, { ...options, filePath }) as T;
}
