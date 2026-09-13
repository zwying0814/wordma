import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "cn"

/**
 * 复选框（shadcn base-nova 风格，底座为已安装的 `@base-ui/react/checkbox`，无需额外依赖）。
 *
 * 状态通过 `data-checked` / `data-unchecked` / `data-disabled` 暴露给样式，
 * 这是 Base UI 该组件的约定属性名。
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background shadow-xs transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "dark:bg-input/30",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <CheckIcon className="size-3" strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
