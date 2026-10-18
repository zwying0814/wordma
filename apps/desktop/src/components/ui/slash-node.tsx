'use client';

import {
  Columns3Icon,
  FileCodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  RadicalIcon,
  SquareIcon,
  TableIcon,
} from 'lucide-react';
import { KEYS, type TComboboxInputElement } from 'platejs';
import { PlateElement, type PlateElementProps, type PlateEditor } from 'platejs/react';
import * as React from 'react';

import {
  ACTION_THREE_COLUMNS,
  insertBlock,
  insertInlineElement,
} from '@/components/editor/transforms';
import {
  InlineCombobox,
  type InlineComboboxGroup,
} from '@/components/ui/inline-combobox';

/** `/` 命令面板：命令集对齐固定工具栏的 Insert 菜单 */
function slashGroups(editor: PlateEditor): InlineComboboxGroup[] {
  const block = (value: string) => () => insertBlock(editor, value);

  return [
    {
      value: '基础块',
      items: [
        {
          icon: <PilcrowIcon />,
          keywords: ['paragraph', 'text', 'p', 'duanluo', '正文', '段落'],
          label: '段落',
          onSelect: block(KEYS.p),
          value: KEYS.p,
        },
        {
          icon: <Heading1Icon />,
          keywords: ['heading 1', 'heading', 'h1', 'title', 'biaoti', '标题'],
          label: '标题 1',
          onSelect: block(KEYS.h1),
          value: KEYS.h1,
        },
        {
          icon: <Heading2Icon />,
          keywords: ['heading 2', 'subtitle', 'h2', 'biaoti', '标题'],
          label: '标题 2',
          onSelect: block(KEYS.h2),
          value: KEYS.h2,
        },
        {
          icon: <Heading3Icon />,
          keywords: ['heading 3', 'subtitle', 'h3', 'biaoti', '标题'],
          label: '标题 3',
          onSelect: block(KEYS.h3),
          value: KEYS.h3,
        },
        {
          icon: <TableIcon />,
          keywords: ['table', 'biaoge', '表格'],
          label: '表格',
          onSelect: block(KEYS.table),
          value: KEYS.table,
        },
        {
          icon: <FileCodeIcon />,
          keywords: ['code', 'codeblock', '```', 'daima', '代码', '代码块'],
          label: '代码块',
          onSelect: block(KEYS.codeBlock),
          value: KEYS.codeBlock,
        },
        {
          icon: <QuoteIcon />,
          keywords: ['quote', 'blockquote', 'citation', '>', 'yinyong', '引用'],
          label: '引用',
          onSelect: block(KEYS.blockquote),
          value: KEYS.blockquote,
        },
        {
          icon: <MinusIcon />,
          keywords: ['divider', 'hr', 'separator', '---', 'fenge', '分割线'],
          label: '分割线',
          onSelect: block(KEYS.hr),
          value: KEYS.hr,
        },
      ],
    },
    {
      value: '列表',
      items: [
        {
          icon: <ListIcon />,
          keywords: ['unordered', 'ul', 'bullet', 'disc', '-', 'wuxu', '无序列表'],
          label: '无序列表',
          onSelect: block(KEYS.ul),
          value: KEYS.ul,
        },
        {
          icon: <ListOrderedIcon />,
          keywords: ['ordered', 'ol', 'number', 'decimal', '1', 'youxu', '有序列表'],
          label: '有序列表',
          onSelect: block(KEYS.ol),
          value: KEYS.ol,
        },
        {
          icon: <SquareIcon />,
          keywords: ['todo', 'task', 'checkbox', '[]', 'daiban', '待办列表'],
          label: '待办列表',
          onSelect: block(KEYS.listTodo),
          value: KEYS.listTodo,
        },
      ],
    },
    {
      value: '分栏与公式',
      items: [
        {
          icon: <Columns3Icon />,
          keywords: ['columns', 'column', '3 columns', 'fenlan', 'sanlan', '分栏', '三栏'],
          label: '三栏布局',
          onSelect: block(ACTION_THREE_COLUMNS),
          value: ACTION_THREE_COLUMNS,
        },
        {
          focusEditor: false,
          icon: <RadicalIcon />,
          keywords: ['equation', 'formula', 'tex', 'gongshi', '公式'],
          label: '公式',
          onSelect: block(KEYS.equation),
          value: KEYS.equation,
        },
        {
          focusEditor: false,
          icon: <RadicalIcon />,
          keywords: ['inline equation', 'formula', 'gongshi', '行内公式'],
          label: '行内公式',
          onSelect: () => insertInlineElement(editor, KEYS.inlineEquation),
          value: KEYS.inlineEquation,
        },
      ],
    },
    {
      value: '行内',
      items: [
        {
          icon: <Link2Icon />,
          keywords: ['link', 'url', 'a', 'lianjie', '链接'],
          label: '链接',
          onSelect: () => insertInlineElement(editor, KEYS.link),
          value: KEYS.link,
        },
      ],
    },
  ];
}

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const groups = React.useMemo(() => slashGroups(editor), [editor]);

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} groups={groups} trigger="/" />
      {props.children}
    </PlateElement>
  );
}
