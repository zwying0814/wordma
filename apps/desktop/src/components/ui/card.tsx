import * as React from 'react';

import { cn } from '@/lib/utils';

/** 卡片容器（design .card）：白底 + 细边 + 轻阴影 */
export function Card({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-card',
        className
      )}
      data-slot="card"
      {...props}
    />
  );
}

/** 卡片头（design .card-head） */
export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 border-b border-border px-5 py-3.5',
        className
      )}
      data-slot="card-header"
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('font-semibold text-sm', className)}
      data-slot="card-title"
      {...props}
    />
  );
}

/** 卡片正文（表单区：两列栅格） */
export function CardBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-3.5 p-5', className)}
      data-slot="card-body"
      {...props}
    />
  );
}

/** 卡片底栏（右对齐的操作区） */
export function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 px-5 pb-5', className)}
      data-slot="card-footer"
      {...props}
    />
  );
}

/** 行列表容器（design .rowlist） */
export function CardList({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col', className)}
      data-slot="card-list"
      {...props}
    />
  );
}
