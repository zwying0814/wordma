import { parseDocument } from 'yaml';
import type { Document } from 'yaml';

import type {
  EngineFieldDescriptor,
  EngineInspectEntry,
  EnginePageType,
} from '@/features/engine/api';

type InspectPageType = EnginePageType;
type FieldDescriptor = EngineFieldDescriptor;

export type ParsedNoteSource = {
  data: Record<string, unknown>;
  body: string;
  doc: Document.Parsed | null;
  yamlStart: number;
  closeStart: number;
  bom: boolean;
  error?: string;
};

export type BaseFieldValues = {
  title: string;
  slug: string;
  date: string;
  updated: string;
  description: string;
  tags: string[];
  categories: string[];
  draft: boolean;
  cover: string;
  type: string;
};

export type NoteProperties = {
  parsed: ParsedNoteSource;
  base: BaseFieldValues;
  themeId: string;
  themeValues: Record<string, unknown>;
  fields: FieldDescriptor[];
  pageTypes: InspectPageType[];
  pageTypeId?: string;
  errors: Record<string, string>;
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

function findFrontmatter(text: string):
  | {
      yamlStart: number;
      closeStart: number;
      closeEnd: number;
    }
  | undefined {
  const opening = /^[ \t]*---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!opening) return undefined;

  const yamlStart = opening[0].length;
  const linePattern = /[^\r\n]*(?:\r?\n|$)/g;
  linePattern.lastIndex = yamlStart;

  let match = linePattern.exec(text);
  while (match) {
    if (match[0] === '') break;

    const line = match[0].replace(/\r?\n$/, '');
    if (line.trim() === '---') {
      return {
        yamlStart,
        closeStart: match.index,
        closeEnd: match.index + match[0].length,
      };
    }

    match = linePattern.exec(text);
  }

  return undefined;
}

export function parseNoteSource(
  source: string,
): ParsedNoteSource {
  const bom = source.charCodeAt(0) === 0xfeff;
  const text = bom ? source.slice(1) : source;
  const range = findFrontmatter(text);

  if (!range) {
    return {
      data: {},
      body: text,
      doc: null,
      yamlStart: 0,
      closeStart: 0,
      bom,
      error: text.trimStart().startsWith('---')
        ? 'frontmatter 未闭合'
        : '缺少 frontmatter',
    };
  }

  const yamlText = text.slice(range.yamlStart, range.closeStart);
  const doc = parseDocument(yamlText, {
    prettyErrors: true,
  });

  if (doc.errors.length > 0) {
    return {
      data: {},
      body: text.slice(range.closeEnd),
      doc,
      yamlStart: range.yamlStart,
      closeStart: range.closeStart,
      bom,
      error: doc.errors
        .map((error) => error.message)
        .join('\n'),
    };
  }

  let parsed: unknown;
  try {
    parsed = doc.toJS();
  } catch (error) {
    return {
      data: {},
      body: text.slice(range.closeEnd),
      doc,
      yamlStart: range.yamlStart,
      closeStart: range.closeStart,
      bom,
      error: error instanceof Error
        ? error.message
        : String(error),
    };
  }

  if (parsed !== null && !isPlainRecord(parsed)) {
    return {
      data: {},
      body: text.slice(range.closeEnd),
      doc,
      yamlStart: range.yamlStart,
      closeStart: range.closeStart,
      bom,
      error: 'frontmatter 必须是 YAML 对象',
    };
  }

  return {
    data: isPlainRecord(parsed) ? parsed : {},
    body: text.slice(range.closeEnd),
    doc,
    yamlStart: range.yamlStart,
    closeStart: range.closeStart,
    bom,
  };
}

function replaceDocument(source: string, parsed: ParsedNoteSource): string {
  if (!parsed.doc) return source;

  const text = parsed.bom ? source.slice(1) : source;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let yaml = parsed.doc.toString({ lineWidth: 0 });

  if (yaml.length > 0 && !yaml.endsWith('\n')) {
    yaml += '\n';
  }
  if (newline === '\r\n') {
    yaml = yaml.replace(/\n/g, '\r\n');
  }

  return `${parsed.bom ? '﻿' : ''}${text.slice(
    0,
    parsed.yamlStart,
  )}${yaml}${text.slice(parsed.closeStart)}`;
}

/**
 * 只修改指定 YAML 路径；undefined 删除该 key。
 * 注释、未知字段与其他主题 namespace 由 yaml Document 保留。
 */
export function updateNoteField(
  source: string,
  path: string[],
  value: unknown,
): string {
  const parsed = parseNoteSource(source);
  if (parsed.error || !parsed.doc) return source;

  if (value === undefined) {
    parsed.doc.deleteIn(path);
  } else {
    parsed.doc.setIn(path, value);
  }

  return replaceDocument(source, parsed);
}

function readThemeRaw(
  data: Record<string, unknown>,
  themeId: string,
): Record<string, unknown> {
  if (!isPlainRecord(data.theme)) return {};

  const namespace = data.theme[themeId];
  return isPlainRecord(namespace) ? namespace : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string',
      )
    : [];
}

function isDateString(value: string): boolean {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  return !Number.isNaN(Date.parse(value));
}

function validateBaseFields(
  data: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (
    typeof data.title !== 'string' ||
    data.title.trim().length === 0
  ) {
    errors['base:title'] = '标题不能为空';
  }

  for (const [key, label] of [
    ['slug', 'Slug'],
    ['cover', '封面'],
  ] as const) {
    const value = data[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' || value.length === 0)
    ) {
      errors[`base:${key}`] = `${label}必须是非空字符串`;
    }
  }

  for (const [key, label] of [
    ['date', '日期'],
    ['updated', '更新时间'],
  ] as const) {
    const value = data[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' || !isDateString(value))
    ) {
      errors[`base:${key}`] = `${label}格式无效`;
    }
  }

  if (
    data.description !== undefined &&
    typeof data.description !== 'string'
  ) {
    errors['base:description'] = '描述必须是字符串';
  }

  for (const [key, label] of [
    ['tags', '标签'],
    ['categories', '分类'],
  ] as const) {
    const value = data[key];
    if (
      value !== undefined &&
      (!Array.isArray(value) ||
        value.some(
          (item) =>
            typeof item !== 'string' || item.length === 0,
        ))
    ) {
      errors[`base:${key}`] = `${label}必须是非空字符串数组`;
    }
  }

  if (
    data.draft !== undefined &&
    typeof data.draft !== 'boolean'
  ) {
    errors['base:draft'] = '草稿状态必须是布尔值';
  }

  if (
    data.type !== undefined &&
    (typeof data.type !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(data.type))
  ) {
    errors['base:type'] = '页面类型格式无效';
  }

  return errors;
}

function validateThemeValue(
  descriptor: FieldDescriptor,
  value: unknown,
): string | undefined {
  switch (descriptor.type) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string') return '必须是字符串';
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
        : '必须是选项之一';

    case 'color':
    case 'image':
      return typeof value === 'string' && value.length > 0
        ? undefined
        : '必须是非空字符串';

    case 'date':
      return typeof value === 'string' &&
        isDateString(value)
        ? undefined
        : '必须是 YYYY-MM-DD 日期';

    case 'list': {
      if (!Array.isArray(value)) return '必须是数组';
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
      return value.every((item) =>
        descriptor.item === 'string'
          ? typeof item === 'string'
          : typeof item === 'number' &&
            Number.isFinite(item),
      )
        ? undefined
        : `每一项必须是 ${descriptor.item}`;
    }
  }
}

function validateThemeFields(
  data: Record<string, unknown>,
  fields: FieldDescriptor[],
  themeId: string,
): Record<string, string> {
  const raw = readThemeRaw(data, themeId);
  const errors: Record<string, string> = {};

  for (const descriptor of fields) {
    if (!(descriptor.key in raw)) {
      if (
        descriptor.required &&
        descriptor.default === undefined
      ) {
        errors[`theme:${descriptor.key}`] = '缺少必填字段';
      }
      continue;
    }

    const error = validateThemeValue(
      descriptor,
      raw[descriptor.key],
    );
    if (error) {
      errors[`theme:${descriptor.key}`] = error;
    }
  }

  return errors;
}

function resolveFields(
  entry: EngineInspectEntry | undefined,
  data: Record<string, unknown>,
  postFields: FieldDescriptor[],
  pageFields: FieldDescriptor[],
  pageTypes: InspectPageType[],
): {
  fields: FieldDescriptor[];
  pageTypeId?: string;
} {
  if (!entry) return { fields: [] };

  const type =
    typeof data.type === 'string' ? data.type : undefined;
  const pageType = type
    ? pageTypes.find((item) => item.id === type)
    : undefined;

  if (type) {
    return {
      fields: pageType?.fields ?? [],
      pageTypeId: type,
    };
  }

  return {
    fields:
      entry.kind === 'post' ? postFields : pageFields,
  };
}

export function buildNoteProperties(
  source: string,
  entry: EngineInspectEntry | undefined,
  options: {
    themeId: string;
    postFields: FieldDescriptor[];
    pageFields: FieldDescriptor[];
    pageTypes: InspectPageType[];
  },
): NoteProperties {
  const parsed = parseNoteSource(source);
  const data = parsed.data;
  const themeId = options.themeId;
  const themeRaw = readThemeRaw(data, themeId);
  const { fields, pageTypeId } = resolveFields(
    entry,
    data,
    options.postFields,
    options.pageFields,
    options.pageTypes,
  );
  const themeValues: Record<string, unknown> = {
    ...themeRaw,
  };

  for (const descriptor of fields) {
    if (
      descriptor.default !== undefined &&
      !(descriptor.key in themeValues)
    ) {
      themeValues[descriptor.key] = descriptor.default;
    }
  }

  const errors: Record<string, string> = {};
  if (parsed.error) {
    errors.document = parsed.error;
  } else {
    Object.assign(errors, validateBaseFields(data));
    Object.assign(
      errors,
      validateThemeFields(data, fields, themeId),
    );
  }

  return {
    parsed,
    base: {
      title: stringValue(data.title),
      slug: stringValue(data.slug),
      date: stringValue(data.date),
      updated: stringValue(data.updated),
      description: stringValue(data.description),
      tags: stringList(data.tags),
      categories: stringList(data.categories),
      draft: data.draft === true,
      cover: stringValue(data.cover),
      type: stringValue(data.type),
    },
    themeId,
    themeValues,
    fields,
    pageTypes: options.pageTypes,
    pageTypeId,
    errors,
  };
}
