export const RESERVED_PAGE_FIELDS = [
  'id',
  'kind',
  'type',
  'title',
  'slug',
  'date',
  'updated',
  'description',
  'tags',
  'categories',
  'draft',
  'cover',
  'data',
  'theme',
] as const;

export type ReservedPageField = (typeof RESERVED_PAGE_FIELDS)[number];

export const PAGE_FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;
export const SETTING_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export type ThemeFieldBag = Record<string, Record<string, unknown>>;

const RESERVED_PAGE_FIELD_SET = new Set<string>(RESERVED_PAGE_FIELDS);

export function isReservedPageField(key: string): boolean {
  return RESERVED_PAGE_FIELD_SET.has(key);
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 读取当前主题命名空间下的字段。
 *
 * 数据形如：
 *   theme:
 *     wordma-theme-journal:
 *       heroStyle: wide
 */
export function readThemeFields<T = Record<string, unknown>>(
  data: Record<string, unknown>,
  themeId: string,
): T | undefined {
  if (!isPlainRecord(data.theme)) return undefined;

  const fields = data.theme[themeId];
  if (!isPlainRecord(fields)) return undefined;

  return fields as T;
}
