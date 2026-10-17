'use client';

import type { Alignment } from '@platejs/basic-styles';
import { TextAlignPlugin } from '@platejs/basic-styles/react';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
} from 'lucide-react';
import type { TRange } from 'platejs';
import { useEditorPlugin, useSelectionFragmentProp } from 'platejs/react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ToolbarButton } from './toolbar';

const items = [
  {
    icon: AlignLeftIcon,
    value: 'left',
  },
  {
    icon: AlignCenterIcon,
    value: 'center',
  },
  {
    icon: AlignRightIcon,
    value: 'right',
  },
  {
    icon: AlignJustifyIcon,
    value: 'justify',
  },
];

/** 选区是否一致（比较两点，不引入 slate 运行时 API） */
function isSameSelection(a: TRange | null, b: TRange | null) {
  if (!a || !b) return a === b;
  return (
    a.anchor.offset === b.anchor.offset &&
    a.focus.offset === b.focus.offset &&
    a.anchor.path.join() === b.anchor.path.join() &&
    a.focus.path.join() === b.focus.path.join()
  );
}

export function AlignToolbarButton(
  props: React.ComponentProps<typeof DropdownMenu>
) {
  const { editor, tf } = useEditorPlugin(TextAlignPlugin);
  // 插件默认值是 'start'（左对齐的默认态），面板里没有 start 项，
  // 归一到 'left' 才能高亮出当前对齐方式
  const rawValue = useSelectionFragmentProp({
    defaultValue: 'start',
    getProp: (node) => node.align,
  });
  const value = !rawValue || rawValue === 'start' ? 'left' : rawValue;

  // 菜单打开瞬间保存选区：弹层交互期间 Plate 可能丢选区，
  // 应用对齐需按保存的选区（含图片等 void 选中）操作
  const selectionRef = React.useRef<TRange | null>(null);
  const [open, setOpen] = React.useState(false);
  const IconValue =
    items.find((item) => item.value === value)?.icon ?? AlignLeftIcon;

  return (
    <DropdownMenu
      modal={false}
      // 面板是一行四个图标，方向键按左右切换
      orientation="horizontal"
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          selectionRef.current = editor.selection;
        }
        setOpen(nextOpen);
      }}
      // 关闭动画结束、焦点归位之后再写回选区：
      // 弹层接管焦点期间 contenteditable 的原生选区会丢失，浏览器把光标
      // 放回编辑器开头，slate-react 的 DOM→模型再同步随即把模型选区改成
      // 首行 —— 于是「设置完图片对齐再点对齐」时光标跳回首行、对齐也作用
      // 到错误的块上。必须等这一轮再同步结束后再恢复。
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const saved = selectionRef.current;
        if (!saved) return;
        if (editor.selection && isSameSelection(editor.selection, saved)) return;
        editor.tf.focus();
        editor.tf.select(saved);
      }}
      open={open}
      {...props}
    >
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            aria-label="Align"
            isDropdown
            pressed={open}
            tooltip="Align"
          >
            <IconValue />
          </ToolbarButton>
        }
      />

      {/* 一行四个图标横排（弹层宽度默认按内容自适应） */}
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          className="flex flex-row items-center gap-0.5"
          onValueChange={(itemValue) => {
            const saved = selectionRef.current;
            if (saved) {
              editor.tf.select(saved);
            }
            tf.textAlign.setNodes(itemValue as Alignment);
            setOpen(false);
            // 先 focus 再 select：让 slate-react 在编辑器已聚焦的前提下
            // 把模型选区写回 DOM，否则 DOM 选区会停在编辑器起点
            editor.tf.focus();
            if (saved) {
              editor.tf.select(saved);
            }
          }}
          value={value}
        >
          {items.map(({ icon: Icon, value: itemValue }) => (
            <DropdownMenuRadioItem
              aria-label={`Align ${itemValue}`}
              // 正方形图标格；隐藏为竖向列表预留的单选指示位，
              // 用选中底色表示当前对齐方式
              className="size-7 justify-center p-0 data-checked:bg-accent data-checked:text-accent-foreground [&>span:first-child]:hidden"
              key={itemValue}
              value={itemValue}
            >
              <Icon />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
