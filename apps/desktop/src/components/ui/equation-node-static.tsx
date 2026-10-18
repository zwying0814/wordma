import { getEquationHtml } from '@platejs/math';
import { RadicalIcon } from 'lucide-react';
import type { TEquationElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';
import { SlateElement } from 'platejs/static';

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

/** 静态渲染（保存/发布链路）：用 getEquationHtml 直接产出 KaTeX 的 HTML */
export function EquationElementStatic(
  props: SlateElementProps<TEquationElement>
) {
  const texExpression = toTex(props.element);
  const html = getEquationHtml({ element: props.element, options: KATEX_OPTIONS });

  return (
    <SlateElement className="my-1" {...props}>
      <div
        className={cn(
          'group flex select-none items-center justify-center rounded-sm hover:bg-primary/10 data-[selected=true]:bg-primary/10',
          texExpression.length === 0 ? 'bg-muted p-3 pr-9' : 'px-2 py-1'
        )}
      >
        {texExpression.length > 0 ? (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="flex h-7 w-full items-center gap-2 whitespace-nowrap text-muted-foreground text-sm">
            <RadicalIcon className="size-6 text-muted-foreground/80" />
            <div>Add a Tex equation</div>
          </div>
        )}
      </div>
      {props.children}
    </SlateElement>
  );
}

export function InlineEquationElementStatic(
  props: SlateElementProps<TEquationElement>
) {
  const texExpression = toTex(props.element);
  const html = getEquationHtml({ element: props.element, options: KATEX_OPTIONS });

  return (
    <SlateElement
      {...props}
      className="inline-block select-none rounded-sm [&_.katex-display]:my-0"
    >
      <div
        className={cn(
          'relative h-6',
          texExpression.length === 0 &&
            'text-muted-foreground after:absolute after:inset-0 after:-top-0.5 after:-left-1 after:h-[calc(100%+4px)] after:w-[calc(100%+8px)] after:rounded-sm after:bg-muted-foreground/10 after:content-[""]'
        )}
      >
        <span
          className={cn(texExpression.length === 0 && 'hidden', 'font-mono leading-none')}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {texExpression.length === 0 && (
          <span>
            <RadicalIcon className="mr-1 inline-block h-[19px] w-4 py-[1.5px] align-text-bottom" />
            New equation
          </span>
        )}
      </div>
      {props.children}
    </SlateElement>
  );
}
