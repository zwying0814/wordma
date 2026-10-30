import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  type?: "error" | "info";
  children: ReactNode;
  className?: string;
}

/** 行内提示：可恢复错误留在原位展示 */
export function InlineAlert({ type = "error", children, className }: Props) {
  const isError = type === "error";
  const Icon = isError ? CircleAlert : Info;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed",
        isError
          ? "border-destructive/25 bg-destructive-soft text-destructive"
          : "border-border bg-muted text-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
