import { describe, expect, it } from 'bun:test';

import {
  FieldDescriptorSchema,
  PageFrontmatterSchema,
  SiteConfigSchema,
  ThemeManifestSchema,
  readThemeFields,
} from './index';

const baseTheme = {
  id: 'wordma-theme-test',
  displayName: 'Test Theme',
  version: '1.0.0',
  engines: {
    wordma: '>=0.0.0',
  },
};

describe('SiteConfigSchema', () => {
  it('应用默认值', () => {
    const site = SiteConfigSchema.parse({
      site: { title: 'Test Site' },
    });

    expect(site.site.language).toBe('zh-CN');
    expect(site.site.basePath).toBe('');
    expect(site.theme.id).toBe('wordma-theme-default');
    expect(site.navigation).toEqual([]);
  });

  it('缺少 title 时失败', () => {
    expect(() => SiteConfigSchema.parse({ site: {} })).toThrow();
  });

  it('basePath 不允许尾斜杠', () => {
    expect(() =>
      SiteConfigSchema.parse({
        site: { title: 'Test', basePath: '/sub/' },
      }),
    ).toThrow();
  });

  it('拒绝未知顶层字段', () => {
    expect(() =>
      SiteConfigSchema.parse({
        site: { title: 'Test' },
        unknown: true,
      }),
    ).toThrow();
  });
});

describe('FieldDescriptorSchema', () => {
  it('接受全部字段类型', () => {
    const fields = [
      { key: 'text', type: 'text', label: 'Text' },
      { key: 'textarea', type: 'textarea', label: 'Textarea' },
      { key: 'number', type: 'number', label: 'Number' },
      { key: 'switch', type: 'switch', label: 'Switch' },
      {
        key: 'select',
        type: 'select',
        label: 'Select',
        options: [{ label: 'A', value: 'a' }],
      },
      { key: 'color', type: 'color', label: 'Color' },
      { key: 'image', type: 'image', label: 'Image' },
      { key: 'publishedOn', type: 'date', label: 'Date' },
      { key: 'list', type: 'list', label: 'List', item: 'string' },
    ];

    for (const field of fields) {
      expect(FieldDescriptorSchema.parse(field)).toBeTruthy();
    }
  });

  it('select 缺少 options 时失败', () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        key: 'hero',
        type: 'select',
        label: 'Hero',
      }),
    ).toThrow();
  });

  it('select 默认值必须属于选项', () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        key: 'hero',
        type: 'select',
        label: 'Hero',
        options: [{ label: 'A', value: 'a' }],
        default: 'b',
      }),
    ).toThrow();
  });

  it('拒绝保留字段 key', () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        key: 'title',
        type: 'text',
        label: 'Title',
      }),
    ).toThrow();
  });

  it('拒绝不符合规则的 key', () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        key: 'HeroStyle',
        type: 'text',
        label: 'Hero',
      }),
    ).toThrow();
  });

  it('拒绝 min 大于 max', () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        key: 'count',
        type: 'number',
        label: 'Count',
        min: 10,
        max: 1,
      }),
    ).toThrow();
  });

  it('拒绝 list 默认值类型不匹配', () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        key: 'items',
        type: 'list',
        label: 'Items',
        item: 'number',
        default: ['a'],
      }),
    ).toThrow();
  });
});

describe('ThemeManifestSchema', () => {
  it('应用默认值', () => {
    const theme = ThemeManifestSchema.parse(baseTheme);

    expect(theme.settings).toEqual([]);
    expect(theme.pages).toEqual([]);
  });

  it('缺少 displayName 时失败', () => {
    const { displayName, ...rest } = baseTheme;
    void displayName;

    expect(() => ThemeManifestSchema.parse(rest)).toThrow();
  });

  it('拒绝重复的文章字段 key', () => {
    expect(() =>
      ThemeManifestSchema.parse({
        ...baseTheme,
        content: {
          version: 1,
          post: {
            fields: [
              { key: 'hero', type: 'text', label: 'A' },
              { key: 'hero', type: 'text', label: 'B' },
            ],
          },
        },
      }),
    ).toThrow();
  });

  it('拒绝重复的主题页面 id 或 path', () => {
    expect(() =>
      ThemeManifestSchema.parse({
        ...baseTheme,
        pages: [
          { id: 'a', path: '/a', layout: 'a' },
          { id: 'a', path: '/b', layout: 'b' },
        ],
      }),
    ).toThrow();

    expect(() =>
      ThemeManifestSchema.parse({
        ...baseTheme,
        pages: [
          { id: 'a', path: '/same', layout: 'a' },
          { id: 'b', path: '/same', layout: 'b' },
        ],
      }),
    ).toThrow();
  });

  it('拒绝页面类型内重复字段 key', () => {
    expect(() =>
      ThemeManifestSchema.parse({
        ...baseTheme,
        content: {
          version: 1,
          pageTypes: {
            about: {
              label: 'About',
              route: '/about',
              layout: 'about',
              fields: [
                { key: 'subtitle', type: 'text', label: 'A' },
                { key: 'subtitle', type: 'text', label: 'B' },
              ],
            },
          },
        },
      }),
    ).toThrow();
  });
});

describe('PageFrontmatterSchema', () => {
  it('接受主题命名空间', () => {
    const frontmatter = PageFrontmatterSchema.parse({
      title: 'Hello',
      date: '2026-10-25',
      theme: {
        'wordma-theme-test': {
          hero: 'wide',
        },
      },
    });

    expect(frontmatter.tags).toEqual([]);
    expect(frontmatter.draft).toBe(false);
    expect(frontmatter.theme?.['wordma-theme-test']?.hero).toBe('wide');
  });

  it('拒绝未知顶层字段', () => {
    expect(() =>
      PageFrontmatterSchema.parse({
        title: 'Hello',
        heroStyle: 'wide',
      }),
    ).toThrow();
  });

  it('拒绝非法主题命名空间 key', () => {
    expect(() =>
      PageFrontmatterSchema.parse({
        title: 'Hello',
        theme: {
          'bad key': {},
        },
      }),
    ).toThrow();
  });
});

describe('readThemeFields', () => {
  it('读取当前主题字段', () => {
    const fields = readThemeFields<{ hero: string }>(
      {
        theme: {
          'wordma-theme-test': { hero: 'wide' },
        },
      },
      'wordma-theme-test',
    );

    expect(fields?.hero).toBe('wide');
  });

  it('主题命名空间不存在时返回 undefined', () => {
    expect(readThemeFields({}, 'wordma-theme-test')).toBeUndefined();
  });
});
