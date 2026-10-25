import { ContentError } from './diagnostics';

/**
 * 把 frontmatter 日期转换为 UTC 毫秒。
 *
 * - `YYYY-MM-DD`：按 UTC 午夜计算
 * - 其他 ISO 字符串：交给 Date.parse
 */
export function parseDateMs(
  value: string | undefined,
  filePath: string,
): number | undefined {
  if (!value) return undefined;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const ms = Date.UTC(year, month - 1, day);
    const date = new Date(ms);

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new ContentError(
        'INVALID_DATE',
        `日期无效：${value}`,
        { file: filePath },
      );
    }

    return ms;
  }

  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new ContentError(
      'INVALID_DATE',
      `日期无效：${value}`,
      { file: filePath },
    );
  }

  return ms;
}
