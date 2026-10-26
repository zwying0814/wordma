import path from 'node:path';

import {
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';
import type { ThemeManifest } from '@wordma/content';
import { loadThemePackage } from '@wordma/theme';
import type { LoadedThemePackage } from '@wordma/theme';

import { diagnosticsFromError } from '../diagnostics';
import type { Diagnostic } from '../diagnostics';
import { resolveThemeDirectory } from './resolve';
import { checkThemeEngines } from './version';

export type ThemeManifestInspection = {
  directory?: string;
  package?: LoadedThemePackage;
  manifest?: ThemeManifest;
  diagnostics: Diagnostic[];
};

/**
 * 读取主题 manifest，但不执行主题代码。
 *
 * 用于 inspect 等诊断场景：坏主题返回 diagnostic，不抛出。
 */
export function inspectThemeManifest(
  root: string,
  themeId: string,
): ThemeManifestInspection {
  const directory = resolveThemeDirectory(root, themeId);

  if (!directory) {
    return {
      diagnostics: [
        {
          code: 'THEME_NOT_FOUND',
          severity: 'error',
          source: 'theme',
          message: `主题未找到：${themeId}`,
          path: themeId,
        },
      ],
    };
  }

  return inspectThemeDirectory(directory);
}

export function inspectThemeDirectory(
  directory: string,
): ThemeManifestInspection {
  try {
    const manifestPath = path.join(
      directory,
      'theme.yaml',
    );
    const manifest = parseThemeManifest(
      parseYamlFile(manifestPath),
    );
    const diagnostics: Diagnostic[] = [];
    let loaded: LoadedThemePackage | undefined;

    try {
      loaded = loadThemePackage(directory);
    } catch (error) {
      diagnostics.push({
        code: 'INVALID_THEME',
        severity: 'warning',
        source: 'theme',
        message:
          error instanceof Error
            ? error.message
            : String(error),
        file: path.join(directory, 'package.json'),
      });
    }

    const engineCheck = checkThemeEngines(manifest);
    if (!engineCheck.ok) {
      diagnostics.push({
        code: engineCheck.code,
        severity: 'error',
        source: 'theme',
        message: engineCheck.message,
        file: manifestPath,
      });
    }

    return {
      directory,
      ...(loaded ? { package: loaded } : {}),
      manifest,
      diagnostics,
    };
  } catch (error) {
    const manifestPath = path.join(
      directory,
      'theme.yaml',
    );
    const converted = diagnosticsFromError(error);

    return {
      directory,
      diagnostics:
        converted.length > 0
          ? converted.map((diagnostic) => ({
              ...diagnostic,
              code: 'INVALID_THEME',
              source: 'theme' as const,
              file: diagnostic.file ?? manifestPath,
              ...(diagnostic.path
                ? { path: diagnostic.path }
                : {}),
            }))
          : [
              {
                code: 'INVALID_THEME',
                severity: 'error',
                source: 'theme',
                message:
                  error instanceof Error
                    ? error.message
                    : String(error),
                file: manifestPath,
              },
            ],
    };
  }
}
