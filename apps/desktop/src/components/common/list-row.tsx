import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 卡片式容器（对应设计稿 .card）：行列表、统计块共用 */
export function ListCard({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface RowProps {
  children: ReactNode;
  onClick?: (
    event:
      | React.MouseEvent<HTMLDivElement>
      | React.KeyboardEvent<HTMLDivElement>,
  ) => void;
  showBorder?: boolean;
  className?: string;
}

/** 列表行（对应设计稿 .rowitem）；传 onClick 时整行可点 */
export function ListRow({
  children,
  onClick,
  showBorder = false,
  className,
}: RowProps) {
  const interactive = Boolean(onClick);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" && event.target === event.currentTarget) {
                onClick?.(event);
              }
            }
          : undefined
      }
      className={cn(
        "flex w-full items-center gap-3.5 px-[18px] py-[13px] text-left",
        showBorder && "border-b border-border",
        interactive && "cursor-pointer hover:bg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ListRowMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}

export function ListRowTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block truncate text-sm font-semibold text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ListRowMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mt-[3px] block truncate text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ListRowSide({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {children}
    </div>
  );
}
