'use client';

import { useEquationElement, useEquationInput } from '@platejs/math/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { CornerDownLeftIcon, RadicalIcon } from 'lucide-react';
import type { TEquationElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useReadOnly,
  useSelected,
} from 'platejs/react';
import * as React from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const KATEX_OPTIONS = {
  displayMode: true,
  errorColor: '#cc0000',
  fleqn: false,
  leqno: false,
  macros: { '\\f': '#1f(#2)' },
  output: 'htmlAndMathml',
  strict: 'warn',
  throwOnError: false,
  trust: false,
} as const;

/** texExpression 反序列化回来可能是 number/boolean，统一成字符串 */
function toTex(element: TEquationElement): string {
  const { texExpression } = element;
  return typeof texExpression === 'string' ||
    typeof texExpression === 'number' ||
    typeof texExpression === 'boolean'
      ? String(texExpression)
      : '';
}

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const texExpression = toTex(props.element);
  const selected = useSelected();
  const [open, setOpen] = React.useState(selected);
  const katexRef = React.useRef<HTMLDivElement | null>(null);
  const editor = useEditorRef();

  useEquationElement({
    element: props.element,
    katexRef,
    options: KATEX_OPTIONS,
  });

  // 关闭时把整块重新选中（不是留一个文本光标）
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        const id = props.element.id as string | undefined;
        if (!id) return;
        // 弹层关闭时焦点会先回到触发器，slate-react 随之写回选区；
        // BlockSelectionPlugin 的 setSelection 覆写「一有选区就取消块选中」，
        // 所以块选中要等这一轮结束之后再设置
        editor.getApi(BlockSelectionPlugin).blockSelection.set(id);
        window.setTimeout(() => {
          editor.getApi(BlockSelectionPlugin).blockSelection.set(id);
        }, 0);
      }
    },
    [editor, props.element.id]
  );

  return (
    <PlateElement className="my-1" {...props}>
      <Popover modal={false} onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger
          nativeButton={false}
          render={
            <div
              className={cn(
                'group flex cursor-pointer select-none items-center justify-center rounded-sm hover:bg-primary/10 data-[selected=true]:bg-primary/10',
                texExpression.length === 0 ? 'bg-muted p-3 pr-9' : 'px-2 py-1'
              )}
              contentEditable={false}
              data-selected={selected}
              role="button"
            />
          }
        >
          {/* katexRef 必须常驻（useEquationElement 会往里渲 KaTeX） */}
          <span className={cn(texExpression.length === 0 && 'hidden')} ref={katexRef} />
          {texExpression.length === 0 && (
            <div className="flex h-7 w-full items-center gap-2 whitespace-nowrap text-muted-foreground text-sm">
              <RadicalIcon className="size-6 text-muted-foreground/80" />
              <div>输入 TeX 公式</div>
            </div>
          )}
        </PopoverTrigger>

        <EquationPopoverContent
          isInline={false}
          onClose={() => handleOpenChange(false)}
          open={open}
          placeholder={
            'f(x) = \\begin{cases}\n  x^2, &\\quad x > 0 \\\\\n  0, &\\quad x = 0 \\\\\n  -x^2, &\\quad x < 0\n\\end{cases}'
          }
        />
      </Popover>

      {props.children}
    </PlateElement>
  );
}

export function InlineEquationElement(
  props: PlateElementProps<TEquationElement>
) {
  const { element } = props;
  const texExpression = toTex(element);
  const katexRef = React.useRef<HTMLDivElement | null>(null);
  const selected = useSelected();
  const isCollapsed = useEditorSelector(
    (editor) => editor.api.isCollapsed(),
    []
  );
  const [open, setOpen] = React.useState(selected && isCollapsed);
  const editor = useEditorRef();

  React.useEffect(() => {
    if (selected && isCollapsed) {
      setOpen(true);
    }
  }, [selected, isCollapsed]);

  useEquationElement({
    element,
    katexRef,
    options: KATEX_OPTIONS,
  });

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        // 行内公式：光标落到公式后面
        editor.tf.select(element, { focus: true, next: true });
      }
    },
    [editor, element]
  );

  return (
    <PlateElement
      {...props}
      className="mx-1 inline-block select-none rounded-sm [&_.katex-display]:my-0!"
    >
      <Popover modal={false} onOpenChange={handleOpenChange} open={open}>
        <PopoverTrigger
          nativeButton={false}
          render={
            <div
              className={cn(
                'relative h-6',
                'after:absolute after:inset-0 after:-top-0.5 after:-left-1 after:h-[calc(100%+4px)] after:w-[calc(100%+8px)] after:rounded-sm after:content-[""]',
                ((texExpression.length > 0 && open) || selected) &&
                  'after:bg-brand/15',
                texExpression.length === 0 &&
                  'text-muted-foreground after:bg-muted-foreground/10'
              )}
              contentEditable={false}
            />
          }
        >
          <span
            className={cn(
              texExpression.length === 0 && 'hidden',
              'font-mono leading-none'
            )}
            ref={katexRef}
          />
          {texExpression.length === 0 && (
            <span>
              <RadicalIcon className="mr-1 inline-block h-[19px] w-4 py-[1.5px] align-text-bottom" />
              行内公式
            </span>
          )}
        </PopoverTrigger>

        <EquationPopoverContent
          className="my-auto"
          isInline
          onClose={() => handleOpenChange(false)}
          open={open}
          placeholder="E = mc^2"
        />
      </Popover>

      {props.children}
    </PlateElement>
  );
}

const EquationPopoverContent = ({
  className,
  isInline,
  onClose,
  open,
  ...props
}: {
  isInline: boolean;
  open: boolean;
  onClose: () => void;
} & React.ComponentProps<typeof TextareaAutosize>) => {
  const readOnly = useReadOnly();

  // useEquationInput 负责：Enter 提交、Escape 还原、行内公式的左右方向键跳出
  const { props: inputProps, ref: inputRef } = useEquationInput({
    isInline,
    onClose,
    open,
  });

  if (readOnly) return null;

  return (
    <PopoverContent
      className="flex gap-2"
      contentEditable={false}
      // 打开时由 Base UI 把焦点落到输入框；关闭时保留默认的「焦点还给触发器」——
      // 触发器在编辑器内，焦点回到它之后块选中遮罩才会渲染（参考实现同理）
      initialFocus={() => inputRef.current ?? null}
    >
      <TextareaAutosize
        {...inputProps}
        {...props}
        autoFocus
        className={cn('max-h-[50vh] grow resize-none p-2 text-sm', className)}
        ref={inputRef}
      />

      <Button className="px-3" onClick={onClose} variant="secondary">
        完成 <CornerDownLeftIcon className="size-3.5" />
      </Button>
    </PopoverContent>
  );
};
