import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/** 状态/标签胶囊（design .chip） */
const chipVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 font-medium text-xs leading-5 whitespace-nowrap',
  {
    variants: {
      variant: {
        /** 已发布 */
        success: 'bg-success/12 text-success',
        /** 草稿 / 中性态 */
        muted: 'bg-muted text-muted-foreground',
        /** 标签 */
        secondary: 'bg-secondary text-secondary-foreground',
        /** 强调（主色浅底） */
        accent: 'bg-primary/10 text-primary',
        /** 计数等弱化信息 */
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'muted',
    },
  }
);

export function Chip({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof chipVariants>) {
  return (
    <span
      className={cn(chipVariants({ variant }), className)}
      data-slot="chip"
      {...props}
    />
  );
}

/** 文章状态胶囊：已发布 / 草稿 */
export function StatusChip({ status }: { status: 'draft' | 'published' }) {
  return (
    <Chip variant={status === 'published' ? 'success' : 'muted'}>
      {status === 'published' ? '已发布' : '草稿'}
    </Chip>
  );
}

export { chipVariants };
