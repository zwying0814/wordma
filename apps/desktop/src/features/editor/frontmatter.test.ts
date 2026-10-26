import { describe, expect, it } from 'vitest';

import type {
  EngineFieldDescriptor,
  EngineInspectEntry,
  EnginePageType,
} from '@/features/engine/api';

import {
  buildNoteProperties,
  parseNoteSource,
  updateNoteField,
} from './frontmatter';

const source = `---
# keep this comment
title: Hello # inline comment
customKey: keep
theme:
  other-theme:
    accent: red
  wordma-theme-demo:
    heroStyle: wide
---

# Body

Body content.
`;

const entry: EngineInspectEntry = {
  id: 'posts/hello',
  collection: 'posts',
  kind: 'post',
  title: 'Hello',
  slug: 'hello',
  relativePath: 'content/posts/hello.mdx',
  draft: false,
};

const fields: EngineFieldDescriptor[] = [
  {
    key: 'heroStyle',
    label: '封面样式',
    type: 'select',
    options: [
      { label: '宽图', value: 'wide' },
      { label: '卡片', value: 'card' },
    ],
    default: 'wide',
  },
  {
    key: 'featured',
    label: '推荐',
    type: 'switch',
    default: false,
  },
  {
    key: 'subtitle',
    label: '副标题',
    type: 'text',
    required: true,
  },
];

function build(
  input: string,
  overrides: {
    entry?: EngineInspectEntry;
    postFields?: EngineFieldDescriptor[];
    pageFields?: EngineFieldDescriptor[];
    pageTypes?: EnginePageType[];
  } = {},
) {
  return buildNoteProperties(input, overrides.entry ?? entry, {
    themeId: 'wordma-theme-demo',
    postFields: overrides.postFields ?? fields,
    pageFields: overrides.pageFields ?? [],
    pageTypes: overrides.pageTypes ?? [],
  });
}

describe('parseNoteSource', () => {
  it('拆分 frontmatter 与正文', () => {
    const parsed = parseNoteSource(source);

    expect(parsed.error).toBeUndefined();
    expect(parsed.data.title).toBe('Hello');
    expect(parsed.data.customKey).toBe('keep');
    expect(parsed.body).toBe('\n# Body\n\nBody content.\n');
  });

  it('报告缺失和未闭合的 frontmatter', () => {
    expect(parseNoteSource('# Body').error).toBe(
      '缺少 frontmatter',
    );
    expect(parseNoteSource('---\ntitle: X\n# Body').error).toBe(
      'frontmatter 未闭合',
    );
  });

  it('报告无效 YAML', () => {
    expect(
      parseNoteSource('---\ntitle: [\n---\nbody').error,
    ).toBeTruthy();
  });
});

describe('updateNoteField', () => {
  it('只修改目标字段并保留注释、未知字段与正文', () => {
    const next = updateNoteField(source, ['title'], 'Changed');
    const parsed = parseNoteSource(next);

    expect(parsed.error).toBeUndefined();
    expect(parsed.data.title).toBe('Changed');
    expect(parsed.data.customKey).toBe('keep');
    expect(next).toContain('# keep this comment');
    expect(next).toContain('title: Changed # inline comment');
    expect(next).toContain(
      'theme:\n  other-theme:\n    accent: red',
    );
    expect(parsed.body).toBe('\n# Body\n\nBody content.\n');
  });

  it('更新当前主题 namespace 并保留其他 namespace', () => {
    const next = updateNoteField(
      source,
      ['theme', 'wordma-theme-demo', 'heroStyle'],
      'card',
    );
    const parsed = parseNoteSource(next);
    const theme = parsed.data.theme as Record<
      string,
      Record<string, unknown>
    >;

    expect(theme['wordma-theme-demo']?.heroStyle).toBe('card');
    expect(theme['other-theme']?.accent).toBe('red');
    expect(parsed.data.customKey).toBe('keep');
  });

  it('删除字段不会影响其他 key', () => {
    const next = updateNoteField(
      source,
      ['theme', 'wordma-theme-demo', 'heroStyle'],
      undefined,
    );
    const theme = parseNoteSource(next).data.theme as Record<
      string,
      Record<string, unknown>
    >;

    expect(theme['wordma-theme-demo']).toEqual({});
    expect(theme['other-theme']?.accent).toBe('red');
  });

  it('保留 CRLF 正文', () => {
    const crlf = source.replace(/\n/g, '\r\n');
    const next = updateNoteField(crlf, ['title'], 'Changed');

    expect(next).toContain('\r\n# Body\r\n');
    expect(next).not.toMatch(/[^\r]\n# Body/);
  });
});

describe('buildNoteProperties', () => {
  it('为缺失字段填充默认值并报告必填项', () => {
    const properties = build(source);

    expect(properties.themeValues.heroStyle).toBe('wide');
    expect(properties.themeValues.featured).toBe(false);
    expect(properties.fields).toHaveLength(3);
    expect(properties.errors['theme:subtitle']).toBe(
      '缺少必填字段',
    );
  });

  it('保留 frontmatter 中已有的主题字段值', () => {
    const properties = build(
      source.replace(
        '    heroStyle: wide',
        '    heroStyle: card\n    featured: true',
      ),
    );

    expect(properties.themeValues.heroStyle).toBe('card');
    expect(properties.themeValues.featured).toBe(true);
  });

  it('使用 pageType 字段并只显示当前类型字段', () => {
    const pageType: EnginePageType = {
      id: 'about',
      label: '关于',
      route: '/about',
      layout: 'pages/about',
      fields: [
        {
          key: 'team',
          label: '团队',
          type: 'text',
        },
      ],
    };
    const properties = build(
      `---
title: About
type: about
---

Body
`,
      {
        entry: { ...entry, kind: 'page', type: 'about' },
        pageTypes: [pageType],
      },
    );

    expect(properties.pageTypeId).toBe('about');
    expect(properties.fields.map((field) => field.key)).toEqual([
      'team',
    ]);
  });

  it('校验基础字段与主题字段类型', () => {
    const properties = build(`---
title: ''
date: 2026-02-31
tags: hello
theme:
  wordma-theme-demo:
    heroStyle: missing
    featured: 1
---

Body
`);

    expect(properties.errors['base:title']).toBe(
      '标题不能为空',
    );
    expect(properties.errors['base:date']).toBe(
      '日期格式无效',
    );
    expect(properties.errors['base:tags']).toBe(
      '标签必须是非空字符串数组',
    );
    expect(properties.errors['theme:heroStyle']).toBe(
      '必须是选项之一',
    );
    expect(properties.errors['theme:featured']).toBe(
      '必须是布尔值',
    );
  });
});
