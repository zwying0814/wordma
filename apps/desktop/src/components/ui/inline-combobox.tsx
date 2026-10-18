'use client';

import { Combobox } from '@base-ui/react/combobox';
import { filterWords } from '@platejs/combobox';
import { useComboboxInput, useHTMLInputCursorState } from '@platejs/combobox/react';
import type { PointRef, TElement } from 'platejs';
import { useEditorRef } from 'platejs/react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * 内联命令面板（Slate 里的 `/` 输入框 + 候选列表）。
 *
 * 参考实现用 `@ariakit/react` 手写了 400 行；这里改用应用已有的 Base UI
 * `Combobox`：过滤、分组裁剪、方向键循环（`loopFocus`）、首项自动高亮
 * （`autoHighlight`）、`aria-activedescendant`、空态都由它提供。
 *
 * Slate 侧只借用 `@platejs/combobox` 的取消语义（`useComboboxInput`：
 * 失焦/Escape/退格/左右键 → 删掉输入元素并把 `trigger + query` 写回文档）。
 * 搜索词只存在 React 状态里，不写进 Slate。
 */

export type InlineComboboxItem = {
  /** 唯一值（也是命令 id） */
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** 额外匹配词（中英文） */
  keywords?: string[];
  /** 选中后是否把焦点交回编辑器（默认 true） */
  focusEditor?: boolean;
  onSelect: () => void;
};

export type InlineComboboxGroup = {
  value: string;
  items: InlineComboboxItem[];
};

const itemFilter = (item: InlineComboboxItem, query: string) => {
  const needle = query.trim();
  if (!needle) return true;

  return [item.label, item.value, ...(item.keywords ?? [])].some((term) =>
    filterWords(term, needle)
  );
};

const itemToStringLabel = (item: InlineComboboxItem) => item.label;

export function InlineCombobox({
  className,
  element,
  groups,
  showTrigger = true,
  trigger,
}: {
  className?: string;
  element: TElement;
  groups: InlineComboboxGroup[];
  showTrigger?: boolean;
  trigger: string;
}) {
  const editor = useEditorRef();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cursorState = useHTMLInputCursorState(inputRef);
  const [value, setValue] = React.useState('');

  // 取消时要把 trigger + 查询串原样写回文档，这里记住元素前的插入点
  const insertPointRef = React.useRef<PointRef | null>(null);
  React.useEffect(() => {
    insertPointRef.current?.unref();
    insertPointRef.current = null;

    const path = editor.api.findPath(element);
    if (!path) return;

    const point = editor.api.before(path);
    if (!point) return;

    const pointRef = editor.api.pointRef(point);
    insertPointRef.current = pointRef;

    return () => {
      if (insertPointRef.current === pointRef) insertPointRef.current = null;
      pointRef.unref();
    };
  }, [editor, element]);

  // Escape → removeInput → 编辑器重新聚焦 → 输入框 blur → 又触发一次取消；
  // 没有这个守卫会把文本写回两遍
  const cancelledRef = React.useRef(false);

  const { props: inputProps, removeInput } = useComboboxInput({
    autoFocus: true,
    cancelInputOnBlur: true,
    cursorState,
    ref: inputRef,
    onCancelInput: (cause) => {
      if (cancelledRef.current) return;
      cancelledRef.current = true;

      if (cause !== 'backspace') {
        editor.tf.insertText(trigger + value, {
          at: insertPointRef.current?.current ?? undefined,
        });
      }
      if (cause === 'arrowLeft' || cause === 'arrowRight') {
        editor.tf.move({
          distance: 1,
          reverse: cause === 'arrowLeft',
        });
      }
    },
  });

  return (
    <span className={cn('inline-flex items-center', className)} contentEditable={false}>
      <Combobox.Root
        // "always"：空查询时也高亮首项（与参考实现「列表一变就选首项」一致），
        // 否则打开面板直接回车不会有任何反应。
        // Root 的 d.ts 只声明了 boolean，但底层 AriaCombobox 支持 'always'
        // （1.9.0 实测有效），这里按实际类型传。
        autoHighlight={'always' as unknown as boolean}
        filter={itemFilter}
        inputValue={value}
        itemToStringLabel={itemToStringLabel}
        items={groups}
        loopFocus
        onInputValueChange={setValue}
        onValueChange={(item) => {
          if (!item) return;
          const focusEditor = (item as InlineComboboxItem).focusEditor ?? true;

          // 用提交后的回调而不是 Item.onClick：Base UI 的 commitSelection 在
          // onClick 之后运行，会把焦点再抢回输入框（表现为回车后光标没回到编辑器）
          removeInput(false);
          (item as InlineComboboxItem).onSelect();

          // 输入框随元素一起被移除，浏览器会把焦点丢给 <body>；
          // 等 React 提交完这次变更后再把焦点交回编辑器
          // 输入框随元素一起被移除，浏览器会把焦点丢给 <body>；
          // 等 React 提交完这次变更后再把焦点交回编辑器。
          // 注意：此时 Slate 可能「自以为」仍聚焦（isFocused=true）而不动 DOM 焦点，
          // 所以 tf.focus() 之后再用 DOM 焦点兜底一次。
          if (focusEditor) {
            window.setTimeout(() => {
              editor.tf.focus();
              const el = editor.api.toDOMNode(editor) as HTMLElement | undefined;
              if (el && document.activeElement !== el) el.focus();
            }, 0);
          }
        }}
        open
      >
        {showTrigger && <span className="text-muted-foreground">{trigger}</span>}

        {/* 隐形撑宽 span 让输入框宽度跟随内容 */}
        <span className="relative min-h-[1lh]">
          <span aria-hidden className="invisible overflow-hidden text-nowrap">
            {value || '​'}
          </span>

          <Combobox.Input
            {...inputProps}
            className="absolute top-0 left-0 size-full bg-transparent text-foreground outline-none"
            ref={inputRef}
          />
        </span>

        <Combobox.Portal>
          <Combobox.Positioner className="isolate z-50" sideOffset={4}>
            <Combobox.Popup
              className="max-h-[288px] w-[260px] overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
              data-testid="slash-menu"
              // 不参与焦点管理：弹层关闭/卸载时不要「归还焦点」，
              // 否则会把 removeInput 交回编辑器的焦点抢成 <body>
              finalFocus={false}
              initialFocus={false}
            >
              <Combobox.Empty>
                <div className="px-2 py-3 text-center text-muted-foreground text-sm">
                  没有匹配的命令
                </div>
              </Combobox.Empty>

              <Combobox.List>
                {(group: InlineComboboxGroup) => (
                  <Combobox.Group
                    className="pb-1 last:pb-0"
                    items={group.items}
                    key={group.value}
                  >
                    <Combobox.GroupLabel className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
                      {group.value}
                    </Combobox.GroupLabel>

                    <Combobox.Collection>
                      {(item: InlineComboboxItem) => (
                        <Combobox.Item
                          className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                          key={item.value}
                          value={item}
                        >
                          {item.icon}
                          <span className="truncate">{item.label}</span>
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </span>
  );
}
