import { describe, expect, it } from 'bun:test';

import type { ThemeManifest } from '@wordma/content';

import { ThemeError } from '../errors';
import {
  assertThemeEngines,
  checkThemeEngines,
} from './version';

function manifest(range: string): ThemeManifest {
  return {
    id: 'wordma-theme-test',
    displayName: 'Test',
    version: '1.0.0',
    engines: { wordma: range },
    settings: [],
    pages: [],
  };
}

describe('checkThemeEngines', () => {
  it('满足与不满足版本范围', () => {
    expect(
      checkThemeEngines(manifest('^1.0.0'), '1.4.2'),
    ).toMatchObject({
      ok: true,
      range: '^1.0.0',
      current: '1.4.2',
    });

    const mismatch = checkThemeEngines(
      manifest('>=2.0.0'),
      '1.4.2',
    );

    expect(mismatch).toMatchObject({
      ok: false,
      code: 'ENGINE_VERSION_MISMATCH',
    });
    if (mismatch.ok) {
      throw new Error('预期版本不匹配');
    }
    expect(mismatch.message).toContain('>=2.0.0');
    expect(mismatch.message).toContain('1.4.2');
  });

  it('识别非法 range', () => {
    expect(
      checkThemeEngines(
        manifest('not-a-range'),
        '1.0.0',
      ),
    ).toMatchObject({
      ok: false,
      code: 'INVALID_ENGINE_RANGE',
    });
  });

  it('按 semver 规则支持预发布范围', () => {
    expect(
      checkThemeEngines(
        manifest('^1.0.0-beta.1'),
        '1.0.0-beta.2',
      ),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('assertThemeEngines', () => {
  it('抛出带 themeId/path 的 ThemeError', () => {
    try {
      assertThemeEngines(manifest('>=9.0.0'), {
        themeId: 'wordma-theme-test',
        path: '/themes/wordma-theme-test',
        current: '0.0.0',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeError);
      expect((error as ThemeError).code).toBe(
        'ENGINE_VERSION_MISMATCH',
      );
      expect((error as ThemeError).themeId).toBe(
        'wordma-theme-test',
      );
      expect((error as ThemeError).path).toBe(
        '/themes/wordma-theme-test',
      );
      return;
    }

    throw new Error('预期抛出 ThemeError');
  });
});
