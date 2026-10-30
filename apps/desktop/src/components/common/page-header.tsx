import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** 每页顶部：标题 / 副标题 / 右侧主操作（对应设计稿 .page-head） */
export function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <div
      className={cn(
        "mb-5 flex items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-page-title leading-tight font-bold text-foreground">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
