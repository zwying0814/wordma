import type {
  ThemeManifest,
  ThemeSettingDescriptor,
} from '@wordma/content';

import type { Diagnostic } from '../diagnostics';
import { ThemeError } from '../errors';

export type ResolvedThemeSettings = {
  values: Record<string, unknown>;
  defaults: Record<string, unknown>;
  overrides: Record<string, unknown>;
  diagnostics: Diagnostic[];
};

type SettingValueResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

function settingError(
  descriptor: ThemeSettingDescriptor,
  code: string,
  message: string,
): Diagnostic {
  return {
    code,
    severity: 'error',
    source: 'theme',
    message,
    field: descriptor.key,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0
  );
}

function validateSettingValue(
  descriptor: ThemeSettingDescriptor,
  value: unknown,
): SettingValueResult {
  switch (descriptor.type) {
    case 'text':
    case 'textarea':
      return typeof value === 'string'
        ? { ok: true, value }
        : {
            ok: false,
            message: '必须是字符串',
          };

    case 'number':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value)
      ) {
        return {
          ok: false,
          message: '必须是有限数字',
        };
      }
      if (
        descriptor.min !== undefined &&
        value < descriptor.min
      ) {
        return {
          ok: false,
          message: `不能小于 ${descriptor.min}`,
        };
      }
      if (
        descriptor.max !== undefined &&
        value > descriptor.max
      ) {
        return {
          ok: false,
          message: `不能大于 ${descriptor.max}`,
        };
      }
      return { ok: true, value };

    case 'switch':
      return typeof value === 'boolean'
        ? { ok: true, value }
        : {
            ok: false,
            message: '必须是布尔值',
          };

    case 'select':
      return typeof value === 'string' &&
        descriptor.options.some(
          (option) => option.value === value,
        )
        ? { ok: true, value }
        : {
            ok: false,
            message: `必须是选项之一：${descriptor.options
              .map((option) => option.value)
              .join(', ')}`,
          };

    case 'color':
    case 'image':
      return isNonEmptyString(value)
        ? { ok: true, value }
        : {
            ok: false,
            message: '必须是非空字符串',
          };

    default:
      return {
        ok: false,
        message: '未知设置类型',
      };
  }
}

/**
 * 合并主题默认值与站点覆盖，并按 descriptor 校验。
 */
export function resolveThemeSettings(
  manifest: ThemeManifest,
  overrides: Record<string, unknown> = {},
): ResolvedThemeSettings {
  const diagnostics: Diagnostic[] = [];
  const defaults: Record<string, unknown> = {};
  const values: Record<string, unknown> = {};
  const known = new Set(
    manifest.settings.map((setting) => setting.key),
  );

  for (const descriptor of manifest.settings) {
    if (descriptor.default !== undefined) {
      const checked = validateSettingValue(
        descriptor,
        descriptor.default,
      );

      if (checked.ok) {
        defaults[descriptor.key] = checked.value;
        values[descriptor.key] = checked.value;
      } else {
        diagnostics.push(
          settingError(
            descriptor,
            'INVALID_THEME_SETTING',
            `默认值无效：${checked.message}`,
          ),
        );
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        overrides,
        descriptor.key,
      )
    ) {
      const override = overrides[descriptor.key];

      if (override === undefined || override === null) {
        continue;
      }

      const checked = validateSettingValue(
        descriptor,
        override,
      );

      if (checked.ok) {
        values[descriptor.key] = checked.value;
      } else {
        diagnostics.push(
          settingError(
            descriptor,
            'INVALID_THEME_SETTING',
            checked.message,
          ),
        );
      }
    }

    if (!(descriptor.key in values)) {
      if (descriptor.required) {
        diagnostics.push(
          settingError(
            descriptor,
            'MISSING_THEME_SETTING',
            '缺少必填设置',
          ),
        );
      }
      continue;
    }

    if (
      descriptor.required &&
      descriptor.type !== 'switch' &&
      descriptor.type !== 'number' &&
      typeof values[descriptor.key] === 'string' &&
      !isNonEmptyString(values[descriptor.key])
    ) {
      diagnostics.push(
        settingError(
          descriptor,
          'MISSING_THEME_SETTING',
          '必填设置不能为空',
        ),
      );
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (known.has(key)) continue;

    values[key] = value;
    diagnostics.push({
      code: 'UNKNOWN_THEME_SETTING',
      severity: 'warning',
      source: 'theme',
      message: `未知主题设置：${key}`,
      field: key,
    });
  }

  return {
    values,
    defaults,
    overrides: { ...overrides },
    diagnostics,
  };
}

export function assertValidThemeSettings(
  resolved: ResolvedThemeSettings,
  options: {
    themeId: string;
    path?: string;
  },
): void {
  const error = resolved.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );

  if (!error) return;

  throw new ThemeError(
    error.code,
    `${error.field ? `${error.field}: ` : ''}${error.message}`,
    {
      themeId: options.themeId,
      path: options.path,
    },
  );
}
