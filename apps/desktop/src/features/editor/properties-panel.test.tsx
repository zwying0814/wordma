import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  EngineFieldDescriptor,
  EngineInspectEntry,
} from '@/features/engine/api';

import { buildNoteProperties } from './frontmatter';
import { PropertiesPanel } from './properties-panel';

const themeId = 'theme-x';

const entry: EngineInspectEntry = {
  id: 'posts/note',
  collection: 'posts',
  kind: 'post',
  title: 'Note',
  slug: 'note',
  relativePath: 'content/posts/note.mdx',
  draft: false,
};

const fields: EngineFieldDescriptor[] = [
  { key: 'subtitle', label: '副标题', type: 'text', default: 'hello' },
  {
    key: 'summary',
    label: '长摘要',
    type: 'textarea',
    default: 'long text',
  },
  { key: 'count', label: '数量', type: 'number', default: 3 },
  { key: 'enabled', label: '开关', type: 'switch', default: true },
  {
    key: 'layout',
    label: '布局',
    type: 'select',
    default: 'a',
    options: [
      { label: '甲', value: 'a' },
      { label: '乙', value: 'b' },
    ],
  },
  { key: 'accent', label: '颜色', type: 'color', default: '#112233' },
  {
    key: 'cover',
    label: '封面图',
    type: 'image',
    default: '/x.jpg',
  },
  {
    key: 'published',
    label: '发布日期',
    type: 'date',
    default: '2026-10-25',
  },
  {
    key: 'keywords',
    label: '关键词',
    type: 'list',
    item: 'string',
    default: ['one', 'two'],
  },
];

const source = `---
title: Note
---

Body
`;

function setup() {
  const onChange = vi.fn();
  const properties = buildNoteProperties(source, entry, {
    themeId,
    postFields: fields,
    pageFields: [],
    pageTypes: [],
  });

  render(
    <PropertiesPanel
      properties={properties}
      onChange={onChange}
    />,
  );

  return onChange;
}

describe('PropertiesPanel', () => {
  it('按 descriptor 渲染控件并显示默认值', () => {
    setup();

    expect(screen.getByLabelText(/^标题/)).toHaveValue('Note');
    expect(screen.getByLabelText('副标题')).toHaveValue('hello');
    expect(screen.getByLabelText('长摘要')).toHaveValue(
      'long text',
    );
    expect(screen.getByLabelText('数量')).toHaveValue(3);
    expect(
      screen.getByRole('switch', { name: '开关' }),
    ).toBeChecked();
    expect(screen.getByText('甲')).toBeInTheDocument();
    expect(screen.getByLabelText('颜色')).toHaveValue(
      '#112233',
    );
    expect(screen.getByLabelText('封面图')).toHaveValue(
      '/x.jpg',
    );
    expect(screen.getByLabelText('发布日期')).toHaveValue(
      '2026-10-25',
    );
    expect(screen.getByLabelText('关键词')).toHaveValue(
      'one, two',
    );
  });

  it('把每种控件的修改写入对应 YAML 路径', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    const themePath = (key: string) => [
      'theme',
      themeId,
      key,
    ];

    fireEvent.change(screen.getByLabelText(/^标题/), {
      target: { value: 'Renamed' },
    });
    expect(onChange).toHaveBeenCalledWith(
      ['title'],
      'Renamed',
    );

    fireEvent.change(screen.getByLabelText('副标题'), {
      target: { value: 'new' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('subtitle'),
      'new',
    );

    fireEvent.change(screen.getByLabelText('长摘要'), {
      target: { value: 'more' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('summary'),
      'more',
    );

    fireEvent.change(screen.getByLabelText('数量'), {
      target: { value: '5' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('count'),
      5,
    );

    await user.click(
      screen.getByRole('switch', { name: '开关' }),
    );
    expect(onChange).toHaveBeenCalledWith(
      themePath('enabled'),
      false,
    );

    fireEvent.change(screen.getByLabelText('颜色'), {
      target: { value: '#abcdef' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('accent'),
      '#abcdef',
    );

    fireEvent.change(screen.getByLabelText('封面图'), {
      target: { value: '/y.jpg' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('cover'),
      '/y.jpg',
    );

    fireEvent.change(screen.getByLabelText('发布日期'), {
      target: { value: '2026-11-01' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('published'),
      '2026-11-01',
    );

    fireEvent.change(screen.getByLabelText('关键词'), {
      target: { value: 'a, b' },
    });
    expect(onChange).toHaveBeenCalledWith(
      themePath('keywords'),
      ['a', 'b'],
    );
  });
});
