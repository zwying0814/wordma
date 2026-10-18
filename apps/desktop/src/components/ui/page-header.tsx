import * as React from 'react';

import { cn } from '@/lib/utils';

/** 页头（design .page-head）：标题 + 副标题 + 右侧操作 */
export function PageHeader({
  className,
  actions,
  subtitle,
  title,
  ...props
}: React.ComponentProps<'div'> & {
  actions?: React.ReactNode;
  subtitle?: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <div
      className={cn('mb-5 flex items-center gap-3', className)}
      data-slot="page-header"
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h1 className="font-bold text-page-title tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-muted-foreground text-sm">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 统计卡片（design .stat-card） */
export function StatCard({
  caption,
  value,
}: {
  caption: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card px-5 py-4 shadow-card"
      data-slot="stat-card"
    >
      <span className="block font-bold text-2xl tabular-nums leading-tight">
        {value}
      </span>
      <span className="mt-0.5 block text-muted-foreground text-xs">
        {caption}
      </span>
    </div>
  );
}
