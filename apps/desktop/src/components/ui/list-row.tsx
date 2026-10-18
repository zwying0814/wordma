import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * 列表行（design .rowitem）：标题 + 次要信息 + 右侧状态/操作。
 * 传入 onClick 时整行可点（Enter 也可触发），右侧按钮自行 stopPropagation。
 */
export function ListRow({
  className,
  actions,
  meta,
  onClick,
  title,
  ...props
}: React.ComponentProps<'div'> & {
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  onClick?: () => void;
  title: React.ReactNode;
}) {
  const interactive = Boolean(onClick);

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3.5 border-b border-border px-5 py-3.5 text-left transition-colors last:border-b-0',
        interactive && 'cursor-pointer hover:bg-accent/60',
        className
      )}
      data-slot="list-row"
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter') onClick?.();
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-sm">{title}</span>
        {meta && (
          <span className="mt-0.5 block truncate text-muted-foreground text-xs">
            {meta}
          </span>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}
