import type { ThemeManifest } from '@wordma/content';
import { satisfies, validRange } from 'semver';

import { ENGINE_VERSION } from '../constants';
import { ThemeError } from '../errors';

export type ThemeEngineCheck =
  | {
      ok: true;
      range: string;
      current: string;
    }
  | {
      ok: false;
      code:
        | 'ENGINE_VERSION_MISMATCH'
        | 'INVALID_ENGINE_RANGE';
      message: string;
      range: string;
      current: string;
    };

export function checkThemeEngines(
  manifest: ThemeManifest,
  current = ENGINE_VERSION,
): ThemeEngineCheck {
  const range = manifest.engines.wordma;

  if (!validRange(range)) {
    return {
      ok: false,
      code: 'INVALID_ENGINE_RANGE',
      message: `主题 engines.wordma 不是合法的 semver range：${range}`,
      range,
      current,
    };
  }

  if (
    !satisfies(current, range, {
      includePrerelease: true,
    })
  ) {
    return {
      ok: false,
      code: 'ENGINE_VERSION_MISMATCH',
      message: `主题要求 Wordma ${range}，当前引擎版本为 ${current}`,
      range,
      current,
    };
  }

  return {
    ok: true,
    range,
    current,
  };
}

export function assertThemeEngines(
  manifest: ThemeManifest,
  options: {
    themeId?: string;
    path?: string;
    current?: string;
  } = {},
): void {
  const check = checkThemeEngines(
    manifest,
    options.current,
  );

  if (check.ok) return;

  throw new ThemeError(check.code, check.message, {
    themeId: options.themeId ?? manifest.id,
    path: options.path,
  });
}
