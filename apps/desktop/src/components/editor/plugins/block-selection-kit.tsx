'use client';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import { getPluginTypes, KEYS } from 'platejs';

import { BlockSelection } from '@/components/ui/block-selection';

/** 元素是否被块选中插件标记为可选（类名由插件自己注入，见下） */
export const hasSelectableClass = ({
  attributes,
  className,
}: {
  attributes: { className?: string };
  className?: string;
}) =>
  [className, attributes.className]
    .filter(Boolean)
    .join(' ')
    .includes('slate-selectable');

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      // 块菜单（BlockMenuPlugin + 右键菜单）本期不做
      enableContextMenu: false,
      // 表格单元格与代码行不参与块选中，表格整体/行由 BlockSelection 内部再兜一层
      isSelectable: (element) =>
        !getPluginTypes(editor, [KEYS.column, KEYS.codeLine, KEYS.td]).includes(
          element.type
        ),
    },
    render: {
      // belowRootNodes 会对所有元素调用；slate-selectable 由插件通过
      // inject.nodeProps 注入到可选元素上，这里用它做门禁
      belowRootNodes: (props) => {
        if (!hasSelectableClass(props)) return null;

        return <BlockSelection {...(props as any)} />;
      },
    },
  })),
];
