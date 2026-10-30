import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** 页面级加载态：居中转圈 */
export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center p-12", className)}>
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

/** 全屏加载态：用于应用壳初始化 */
export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <Spinner className="size-5 text-muted-foreground" />
      {label ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}
    </div>
  );
}
