import {
  ContentError,
  YamlParseError,
  type ContentDiagnostic,
} from '@wordma/content';
import { ZodError } from 'zod';

import {
  BuildError,
  IslandError,
  MdxError,
  RouteError,
  ThemeError,
} from './errors';

export type DiagnosticSource =
  | 'content'
  | 'theme'
  | 'mdx'
  | 'island'
  | 'style'
  | 'route'
  | 'build'
  | 'watch'
  | 'server';

export type Diagnostic = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  source: DiagnosticSource;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  path?: string;
  field?: string;
  exportName?: string;
};

function themeSource(error: ThemeError): DiagnosticSource {
  return error.code.includes('STYLE') ||
    error.code.startsWith('CSS_') ||
    error.code === 'TAILWIND_PRECOMPILE_REQUIRED' ||
    error.code === 'THEME_CSS_MODULES_UNSUPPORTED'
    ? 'style'
    : 'theme';
}

export function diagnosticFromContent(
  item: ContentDiagnostic,
  source: DiagnosticSource = 'content',
): Diagnostic {
  return {
    code: item.code,
    severity: item.severity,
    source,
    message: item.message,
    ...(item.file ? { file: item.file } : {}),
    ...(item.path ? { path: item.path } : {}),
  };
}

export function diagnosticsFromError(
  error: unknown,
): Diagnostic[] {
  if (error instanceof YamlParseError) {
    return error.diagnostics.map((item) => ({
      code: item.code,
      severity: 'error' as const,
      source: 'content' as const,
      message: item.message,
      file: item.file,
      line: item.line,
      column: item.column,
    }));
  }

  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      code: 'INVALID_SCHEMA',
      severity: 'error' as const,
      source: 'content' as const,
      message: issue.message,
      field:
        issue.path.join('.') || '(root)',
    }));
  }

  if (error instanceof MdxError) {
    return [
      {
        code: error.code,
        severity: 'error',
        source: 'mdx',
        message: error.message,
        ...(error.file ? { file: error.file } : {}),
        ...(error.line !== undefined
          ? { line: error.line }
          : {}),
        ...(error.column !== undefined
          ? { column: error.column }
          : {}),
      },
    ];
  }

  if (error instanceof IslandError) {
    return [
      {
        code: error.code,
        severity: 'error',
        source: 'island',
        message: error.message,
        ...(error.file ? { file: error.file } : {}),
        ...(error.exportName
          ? { exportName: error.exportName }
          : {}),
      },
    ];
  }

  if (error instanceof ThemeError) {
    return [
      {
        code: error.code,
        severity: 'error',
        source: themeSource(error),
        message: error.message,
        ...(error.path ? { file: error.path } : {}),
      },
    ];
  }

  if (error instanceof RouteError) {
    return [
      {
        code: error.code,
        severity: 'error',
        source: 'route',
        message: error.message,
        ...(error.path ? { path: error.path } : {}),
      },
    ];
  }

  if (error instanceof ContentError) {
    return [
      {
        code: error.code,
        severity: 'error',
        source: 'content',
        message: error.message,
        ...(error.file ? { file: error.file } : {}),
        ...(error.path ? { path: error.path } : {}),
      },
    ];
  }

  if (error instanceof BuildError) {
    return [
      {
        code: error.code,
        severity: 'error',
        source: 'build',
        message: error.message,
        ...(error.path ? { path: error.path } : {}),
      },
    ];
  }

  return [
    {
      code: 'UNKNOWN_ERROR',
      severity: 'error',
      source: 'build',
      message:
        error instanceof Error
          ? error.message
          : String(error),
    },
  ];
}

export function formatDiagnostic(
  diagnostic: Diagnostic,
): string {
  const lines = [
    `[${diagnostic.code}] ${diagnostic.message}`,
  ];
  const position = diagnostic.file
    ? `${diagnostic.file}${
        diagnostic.line === undefined
          ? ''
          : `:${diagnostic.line}${
              diagnostic.column === undefined
                ? ''
                : `:${diagnostic.column}`
            }`
      }`
    : undefined;

  if (position) lines.push(`  at ${position}`);
  if (diagnostic.path) {
    lines.push(`  path: ${diagnostic.path}`);
  }
  if (diagnostic.field) {
    lines.push(`  field: ${diagnostic.field}`);
  }
  if (diagnostic.exportName) {
    lines.push(`  export: ${diagnostic.exportName}`);
  }

  return lines.join('\n');
}
