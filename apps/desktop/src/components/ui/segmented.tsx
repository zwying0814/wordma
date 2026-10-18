import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

/** 分段筛选（design .segmented） */
export function Segmented<T extends string>({
  className,
  options,
  value,
  onValueChange,
  'aria-label': ariaLabel,
}: {
  className?: string;
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  'aria-label'?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'inline-flex gap-0.5 rounded-lg bg-secondary p-0.5',
        className
      )}
      data-slot="segmented"
      role="group"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            aria-pressed={active}
            className={cn(
              'rounded-md px-3 py-1 font-medium text-xs transition-colors duration-150',
              active
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground'
            )}
            data-state={active ? 'on' : 'off'}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
