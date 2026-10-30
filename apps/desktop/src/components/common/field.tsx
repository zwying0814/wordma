import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  label?: ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** 表单字段：标签 + 控件 + 内联错误/提示 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
