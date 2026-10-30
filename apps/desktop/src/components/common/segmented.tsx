import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** 分段筛选（对应设计稿 .segmented） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: Props<T>) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex gap-0.5 rounded-md bg-segmented p-[3px]",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-sm px-3 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-card text-foreground shadow-card",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
