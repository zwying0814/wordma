import type {
  ContentCollectionKind,
  ContentEntry,
  FieldDescriptor,
  ThemeManifest,
  Workspace,
} from '@wordma/content';

import type { Diagnostic } from '../diagnostics';
import { ThemeError } from '../errors';

export type ResolvedThemeFields = {
  themeId: string;
  fields: FieldDescriptor[];
  values: Record<string, unknown>;
  diagnostics: Diagnostic[];
};

export type ApplyThemeContentSchemaResult = {
  entries: number;
  diagnostics: Diagnostic[];
};

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0
  );
}

function isDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateValue(
  descriptor: FieldDescriptor,
  value: unknown,
): string | undefined {
  switch (descriptor.type) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string') {
        return '必须是字符串';
      }
      if (
        descriptor.minLength !== undefined &&
        value.length < descriptor.minLength
      ) {
        return `长度不能小于 ${descriptor.minLength}`;
      }
      if (
        descriptor.maxLength !== undefined &&
        value.length > descriptor.maxLength
      ) {
        return `长度不能大于 ${descriptor.maxLength}`;
      }
      return undefined;
    }

    case 'number':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value)
      ) {
        return '必须是有限数字';
      }
      if (
        descriptor.min !== undefined &&
        value < descriptor.min
      ) {
        return `不能小于 ${descriptor.min}`;
      }
      if (
        descriptor.max !== undefined &&
        value > descriptor.max
      ) {
        return `不能大于 ${descriptor.max}`;
      }
      return undefined;

    case 'switch':
      return typeof value === 'boolean'
        ? undefined
        : '必须是布尔值';

    case 'select':
      return typeof value === 'string' &&
        descriptor.options.some(
          (option) => option.value === value,
        )
        ? undefined
        : `必须是选项之一：${descriptor.options
            .map((option) => option.value)
            .join(', ')}`;

    case 'color':
    case 'image':
      return isNonEmptyString(value)
        ? undefined
        : '必须是非空字符串';

    case 'date':
      return typeof value === 'string' &&
        isDateString(value)
        ? undefined
        : '必须是 YYYY-MM-DD 日期';

    case 'list': {
      if (!Array.isArray(value)) {
        return '必须是数组';
      }
      if (
        descriptor.minItems !== undefined &&
        value.length < descriptor.minItems
      ) {
        return `至少需要 ${descriptor.minItems} 项`;
      }
      if (
        descriptor.maxItems !== undefined &&
        value.length > descriptor.maxItems
      ) {
        return `最多允许 ${descriptor.maxItems} 项`;
      }
      const valid = value.every((item) =>
        descriptor.item === 'string'
          ? typeof item === 'string'
          : typeof item === 'number' &&
            Number.isFinite(item),
      );
      return valid
        ? undefined
        : `每一项必须是 ${descriptor.item}`;
    }

    default:
      return '未知字段类型';
  }
}

export function fieldsForEntry(
  manifest: ThemeManifest,
  entry: ContentEntry,
  collectionKind?: ContentCollectionKind,
): FieldDescriptor[] {
  const pageType = entry.meta.type
    ? manifest.content?.pageTypes?.[entry.meta.type]
    : undefined;

  if (pageType) return pageType.fields;

  const kind =
    collectionKind ??
    (entry.collection === 'posts'
      ? 'post'
      : entry.collection === 'pages'
        ? 'page'
        : 'custom');

  if (kind === 'post') {
    return manifest.content?.post.fields ?? [];
  }

  return manifest.content?.page.fields ?? [];
}

function fieldDiagnostic(
  entry: ContentEntry,
  descriptor: FieldDescriptor,
  themeId: string,
  code: string,
  message: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    source: 'content',
    message: `${themeId}.${descriptor.key}: ${message}`,
    file: entry.filePath,
    field: descriptor.key,
  };
}

export function resolveEntryThemeFields(
  manifest: ThemeManifest,
  entry: ContentEntry,
  themeId: string,
  collectionKind?: ContentCollectionKind,
): ResolvedThemeFields {
  const fields = fieldsForEntry(
    manifest,
    entry,
    collectionKind,
  );
  const data = isPlainRecord(entry.meta.data)
    ? entry.meta.data
    : {};
  const namespaces = isPlainRecord(data.theme)
    ? data.theme
    : {};
  const raw = isPlainRecord(namespaces[themeId])
    ? (namespaces[themeId] as Record<string, unknown>)
    : {};
  const values: Record<string, unknown> = { ...raw };
  const diagnostics: Diagnostic[] = [];
  const known = new Set(
    fields.map((field) => field.key),
  );

  for (const descriptor of fields) {
    if (
      !(descriptor.key in values) &&
      descriptor.default !== undefined
    ) {
      values[descriptor.key] = descriptor.default;
    }

    if (!(descriptor.key in values)) {
      if (descriptor.required) {
        diagnostics.push(
          fieldDiagnostic(
            entry,
            descriptor,
            themeId,
            'MISSING_THEME_FIELD',
            '缺少必填字段',
          ),
        );
      }
      continue;
    }

    const value = values[descriptor.key];
    const error = validateValue(descriptor, value);

    if (error) {
      diagnostics.push(
        fieldDiagnostic(
          entry,
          descriptor,
          themeId,
          'INVALID_THEME_FIELD',
          error,
        ),
      );
      continue;
    }

    if (
      descriptor.required &&
      (descriptor.type === 'text' ||
        descriptor.type === 'textarea') &&
      !isNonEmptyString(value)
    ) {
      diagnostics.push(
        fieldDiagnostic(
          entry,
          descriptor,
          themeId,
          'MISSING_THEME_FIELD',
          '必填字段不能为空',
        ),
      );
    }
  }

  for (const key of Object.keys(raw)) {
    if (known.has(key)) continue;

    diagnostics.push({
      code: 'UNKNOWN_THEME_FIELD',
      severity: 'warning',
      source: 'content',
      message: `${themeId}.${key}: 未声明的主题字段`,
      file: entry.filePath,
      field: key,
    });
  }

  return {
    themeId,
    fields,
    values,
    diagnostics,
  };
}

export function applyThemeContentSchema(
  workspace: Workspace,
  manifest: ThemeManifest,
  themeId: string,
): ApplyThemeContentSchemaResult {
  const diagnostics: Diagnostic[] = [];

  for (const entry of workspace.index.entries) {
    const collectionKind =
      workspace.index.collections[entry.collection]?.kind;
    const resolved = resolveEntryThemeFields(
      manifest,
      entry,
      themeId,
      collectionKind,
    );
    const data = isPlainRecord(entry.meta.data)
      ? entry.meta.data
      : {};

    data.theme = {
      ...(isPlainRecord(data.theme) ? data.theme : {}),
      [themeId]: resolved.values,
    };
    entry.meta.data = data;
    diagnostics.push(...resolved.diagnostics);
  }

  return {
    entries: workspace.index.entries.length,
    diagnostics,
  };
}

export function assertValidThemeFields(
  result: ApplyThemeContentSchemaResult,
  options: {
    themeId: string;
    path?: string;
  },
): void {
  const error = result.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );

  if (!error) return;

  throw new ThemeError(
    error.code,
    [
      error.message,
      error.file ? `文件：${error.file}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    {
      themeId: options.themeId,
      path: options.path ?? error.file,
    },
  );
}
