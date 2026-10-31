import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 编辑器外壳（对应设计稿 .editor）：顶栏 + 居中窄栏 */
export function EditorShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">{children}</div>
  );
}

export function EditorTopBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EditorBody({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 justify-center",
        scroll ? "overflow-y-auto" : "overflow-hidden",
      )}
    >
      {children}
    </div>
  );
}

export function EditorColumn({
  children,
  fill = false,
  className,
}: {
  children: ReactNode;
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col px-8 pt-7",
        fill ? "min-h-0 flex-1 pb-0" : "pb-16",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EditorTitleInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "w-full min-w-0 border-0 bg-transparent p-0 pb-1.5 text-[26px] leading-[1.4] font-bold text-foreground outline-none placeholder:text-muted-foreground",
        className,
      )}
    />
  );
}

export function EditorFieldError({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs text-destructive">{children}</span>;
}
