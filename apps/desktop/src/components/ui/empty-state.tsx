import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/** 空状态（design .empty）：图标 + 标题 + 说明 + 可选操作 */
export function EmptyState({
  className,
  description,
  icon: Icon,
  title,
  children,
}: {
  className?: string;
  description?: React.ReactNode;
  icon: LucideIcon;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-14 text-center',
        className
      )}
      data-slot="empty-state"
    >
      <span className="mb-3.5 grid size-13 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="font-bold text-base">{title}</h3>
      {description && (
        <p className="mt-1.5 mb-4.5 max-w-80 text-muted-foreground text-sm">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
