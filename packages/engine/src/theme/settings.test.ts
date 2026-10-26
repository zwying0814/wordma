import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ThemeManifest,
  ThemeSettingDescriptor,
} from '@wordma/content';

import { buildSite } from '../build';
import { ThemeError } from '../errors';
import {
  assertValidThemeSettings,
  resolveThemeSettings,
} from './settings';

function manifest(
  settings: ThemeSettingDescriptor[],
): ThemeManifest {
  return {
    id: 'wordma-theme-settings',
    displayName: 'Settings',
    version: '1.0.0',
    engines: { wordma: '>=0.0.0' },
    settings,
    pages: [],
  };
}

const descriptors: ThemeSettingDescriptor[] = [
  {
    key: 'title',
    type: 'text',
    label: 'Title',
    default: 'Default',
  },
  {
    key: 'count',
    type: 'number',
    label: 'Count',
    default: 2,
    min: 1,
    max: 5,
  },
  {
    key: 'enabled',
    type: 'switch',
    label: 'Enabled',
    default: true,
  },
  {
    key: 'mode',
    type: 'select',
    label: 'Mode',
    options: [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ],
    default: 'a',
  },
  {
    key: 'accent',
    type: 'color',
    label: 'Accent',
    default: '#000000',
  },
  {
    key: 'cover',
    type: 'image',
    label: 'Cover',
    default: './cover.png',
  },
];

describe('resolveThemeSettings', () => {
  it('合并默认值与站点覆盖', () => {
    const result = resolveThemeSettings(
      manifest(descriptors),
      {
        title: 'Custom',
        count: 4,
        enabled: false,
        mode: 'b',
      },
    );

    expect(result.defaults).toMatchObject({
      title: 'Default',
      count: 2,
      enabled: true,
      mode: 'a',
    });
    expect(result.values).toMatchObject({
      title: 'Custom',
      count: 4,
      enabled: false,
      mode: 'b',
      accent: '#000000',
      cover: './cover.png',
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('校验类型、范围、选项与日期', () => {
    const invalid = resolveThemeSettings(
      manifest(descriptors),
      {
        title: 1,
        count: 9,
        enabled: 'yes',
        mode: 'c',
        accent: '',
      },
    );
    const fields = invalid.diagnostics
      .filter((item) => item.severity === 'error')
      .map((item) => item.field);

    expect(fields).toEqual(
      expect.arrayContaining([
        'title',
        'count',
        'enabled',
        'mode',
        'accent',
      ]),
    );
    expect(
      invalid.diagnostics.every(
        (item) => item.code === 'INVALID_THEME_SETTING',
      ),
    ).toBe(true);
  });

  it('缺少必填设置报错', () => {
    const result = resolveThemeSettings(
      manifest([
        {
          key: 'requiredText',
          type: 'text',
          label: 'Required',
          required: true,
        },
      ]),
      {},
    );

    expect(result.diagnostics[0]).toMatchObject({
      code: 'MISSING_THEME_SETTING',
      severity: 'error',
      field: 'requiredText',
      source: 'theme',
    });
  });

  it('未知 key 保留并给出 warning', () => {
    const result = resolveThemeSettings(
      manifest(descriptors),
      { futureOption: 'kept' },
    );

    expect(result.values.futureOption).toBe('kept');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_THEME_SETTING',
        severity: 'warning',
        field: 'futureOption',
      }),
    );
  });

  it('assertValidThemeSettings 抛 ThemeError', () => {
    const result = resolveThemeSettings(
      manifest(descriptors),
      { count: 9 },
    );

    try {
      assertValidThemeSettings(result, {
        themeId: 'wordma-theme-settings',
        path: '/themes/settings',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeError);
      expect((error as ThemeError).code).toBe(
        'INVALID_THEME_SETTING',
      );
      return;
    }

    throw new Error('预期抛出 ThemeError');
  });
});

describe('build theme settings', () => {
  function workspace(settings: string): string {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-settings-build-'),
    );
    const write = (relative: string, source: string): void => {
      const file = path.join(root, relative);
      mkdirSync(path.dirname(file), {
        recursive: true,
      });
      writeFileSync(file, source);
    };

    write(
      'wordma.site.yaml',
      [
        'site:',
        '  title: Settings Site',
        'theme:',
        '  id: wordma-theme-default',
        settings,
      ].join('\n'),
    );
    write(
      'content/posts/hello.mdx',
      '---\ntitle: Hello\n---\n\n# Hello',
    );

    return root;
  }

  it('站点覆盖进入 PageContext', async () => {
    const root = workspace(
      [
        '  settings:',
        '    accent: "#ff0000"',
        '    future: kept',
      ].join('\n'),
    );

    try {
      const result = await buildSite({
        root,
        outDir: path.join(root, 'dist'),
      });
      const html = readFileSync(
        path.join(root, 'dist/index.html'),
        'utf8',
      );

      expect(html).toContain(
        '--wordma-accent:#ff0000',
      );
      expect(
        result.diagnostics.some(
          (item) => item.code === 'UNKNOWN_THEME_SETTING',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('非法设置阻止构建', async () => {
    const root = workspace(
      [
        '  settings:',
        '    showDescription: "yes"',
      ].join('\n'),
    );

    try {
      await buildSite({
        root,
        outDir: path.join(root, 'dist'),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeError);
      expect((error as ThemeError).code).toBe(
        'INVALID_THEME_SETTING',
      );
      return;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    throw new Error('预期构建失败');
  });
});
