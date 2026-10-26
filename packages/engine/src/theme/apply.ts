import {
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  parseSiteConfig,
  type SiteConfig,
} from '@wordma/content';
import { parseDocument } from 'yaml';
import type { Document } from 'yaml';

import type { Diagnostic } from '../diagnostics';
import { ThemeError } from '../errors';
import { listThemes } from './list';
import { inspectThemeManifest } from './manifest';
import { resolveThemeSettings } from './settings';

export type ThemeApplyOptions = {
  root: string;
  themeId: string;
  resetSettings?: boolean;
};

export type ThemeSettingsApplyOptions = {
  root: string;
  values: Record<string, unknown>;
};

export type ThemeApplyResult = {
  themeId: string;
  diagnostics: Diagnostic[];
};

let tempCounter = 0;

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readSiteDocument(root: string): {
  sitePath: string;
  doc: Document.Parsed;
  site: SiteConfig;
} {
  const sitePath = path.join(root, 'wordma.site.yaml');
  let source: string;

  try {
    source = readFileSync(sitePath, 'utf8');
  } catch {
    throw new ThemeError(
      'MISSING_SITE_CONFIG',
      `缺少站点配置：${sitePath}`,
      { path: sitePath },
    );
  }

  const doc = parseDocument(source, {
    schema: 'core',
    version: '1.2',
    strict: true,
    uniqueKeys: true,
    prettyErrors: true,
  });

  if (doc.errors.length > 0) {
    throw new ThemeError(
      'INVALID_SITE_CONFIG',
      doc.errors
        .map((error) => error.message)
        .join('\n'),
      { path: sitePath },
    );
  }

  let site: SiteConfig;
  try {
    site = parseSiteConfig(doc.toJS());
  } catch (error) {
    throw new ThemeError(
      'INVALID_SITE_CONFIG',
      error instanceof Error
        ? error.message
        : String(error),
      { path: sitePath },
    );
  }

  return { sitePath, doc, site };
}

function documentSource(doc: Document.Parsed): string {
  const source = doc.toString({ lineWidth: 0 });
  return source.endsWith('\n') ? source : `${source}\n`;
}

function writeAtomic(file: string, source: string): void {
  const temp = `${file}.${process.pid}.${++tempCounter}.tmp`;

  try {
    writeFileSync(temp, source, 'utf8');
    try {
      renameSync(temp, file);
    } catch (error) {
      if (process.platform !== 'win32') throw error;
      unlinkSync(file);
      renameSync(temp, file);
    }
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // temp 可能尚未创建
    }
    throw error;
  }
}

export function applyTheme(
  options: ThemeApplyOptions,
): ThemeApplyResult {
  const root = path.resolve(options.root);
  const theme = listThemes(root).find(
    (item) => item.id === options.themeId,
  );

  if (!theme) {
    throw new ThemeError(
      'THEME_NOT_FOUND',
      `主题未找到：${options.themeId}`,
      {
        themeId: options.themeId,
        path: root,
      },
    );
  }

  if (!theme.compatible) {
    const error = theme.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );
    throw new ThemeError(
      error?.code ?? 'THEME_INCOMPATIBLE',
      error?.message ??
        `主题不兼容：${options.themeId}`,
      {
        themeId: options.themeId,
        path: theme.path,
      },
    );
  }

  const { sitePath, doc } = readSiteDocument(root);
  doc.setIn(['theme', 'id'], options.themeId);

  if (options.resetSettings) {
    doc.setIn(['theme', 'settings'], {});
  }

  parseSiteConfig(doc.toJS());
  writeAtomic(sitePath, documentSource(doc));

  return {
    themeId: options.themeId,
    diagnostics: theme.diagnostics,
  };
}

export function applyThemeSettings(
  options: ThemeSettingsApplyOptions,
): ThemeApplyResult {
  if (!isPlainRecord(options.values)) {
    throw new ThemeError(
      'INVALID_THEME_SETTINGS',
      '主题设置必须是对象',
    );
  }

  const root = path.resolve(options.root);
  const { sitePath, doc, site } =
    readSiteDocument(root);
  const themeId = site.theme.id;
  const inspection = inspectThemeManifest(root, themeId);

  if (!inspection.manifest) {
    const error = inspection.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );
    throw new ThemeError(
      error?.code ?? 'THEME_NOT_FOUND',
      error?.message ?? `主题未找到：${themeId}`,
      { themeId, path: sitePath },
    );
  }

  const resolved = resolveThemeSettings(
    inspection.manifest,
    options.values,
  );
  const error = resolved.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );

  if (error) {
    throw new ThemeError(
      error.code,
      `${error.field ? `${error.field}: ` : ''}${error.message}`,
      { themeId, path: sitePath },
    );
  }

  const known = new Set(
    inspection.manifest.settings.map(
      (descriptor) => descriptor.key,
    ),
  );

  for (const key of Object.keys(site.theme.settings)) {
    if (known.has(key) && !(key in options.values)) {
      doc.deleteIn(['theme', 'settings', key]);
    }
  }

  if (!doc.hasIn(['theme', 'settings'])) {
    doc.setIn(['theme', 'settings'], {});
  }

  for (const [key, value] of Object.entries(
    options.values,
  )) {
    doc.setIn(['theme', 'settings', key], value);
  }

  parseSiteConfig(doc.toJS());
  writeAtomic(sitePath, documentSource(doc));

  return {
    themeId,
    diagnostics: resolved.diagnostics,
  };
}
