import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: number;
  label: string;
}

interface Props {
  value: number[];
  options: MultiSelectOption[];
  onChange: (value: number[]) => void;
  placeholder: string;
  label: string;
  className?: string;
}

/** 多选下拉（替代 antd Select mode="multiple"），用于文章分类/标签 */
export function MultiSelect({
  value,
  options,
  onChange,
  placeholder,
  label,
  className,
}: Props) {
  const selected = options.filter((option) => value.includes(option.value));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "flex min-h-7 flex-wrap items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted",
          className,
        )}
      >
        {selected.length === 0 ? (
          <span className="px-0.5">{placeholder}</span>
        ) : (
          selected.map((option) => (
            <span
              key={option.value}
              className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground"
            >
              {option.label}
            </span>
          ))
        )}
        <ChevronDown className="ml-auto size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[260px] w-[220px] overflow-y-auto"
      >
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            暂无选项
          </div>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={value.includes(option.value)}
              closeOnClick={false}
              onCheckedChange={(checked) => {
                onChange(
                  checked
                    ? [...value, option.value]
                    : value.filter((v) => v !== option.value),
                );
              }}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
