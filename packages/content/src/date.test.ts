import { describe, expect, it } from 'bun:test';

import { ContentError, parseDateMs } from './index';

function expectContentError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    expect((error as ContentError).code).toBe(code);
    return;
  }

  throw new Error(`预期抛出 ContentError(${code})`);
}

describe('parseDateMs', () => {
  it('YYYY-MM-DD 按 UTC 计算', () => {
    expect(parseDateMs('2026-10-25', 'a.mdx')).toBe(
      Date.UTC(2026, 9, 25),
    );
  });

  it('接受完整 ISO 字符串', () => {
    expect(parseDateMs('2026-10-25T10:30:00.000Z', 'a.mdx')).toBe(
      Date.UTC(2026, 9, 25, 10, 30),
    );
  });

  it('缺省日期返回 undefined', () => {
    expect(parseDateMs(undefined, 'a.mdx')).toBeUndefined();
  });

  it('不存在的日期报 INVALID_DATE', () => {
    expectContentError(
      () => parseDateMs('2026-02-31', 'a.mdx'),
      'INVALID_DATE',
    );
    expectContentError(
      () => parseDateMs('2026-13-01', 'a.mdx'),
      'INVALID_DATE',
    );
  });

  it('无法解析的字符串报 INVALID_DATE', () => {
    expectContentError(
      () => parseDateMs('not-a-date', 'a.mdx'),
      'INVALID_DATE',
    );
  });
});
