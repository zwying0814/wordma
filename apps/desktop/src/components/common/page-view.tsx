import { cn } from "@/lib/utils";

/** 页面滚动容器（对应设计稿 .view）：28px / 36px / 48px 内边距 */
export function PageView({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("h-full overflow-y-auto px-9 pt-7 pb-12", className)}
      {...props}
    >
      {children}
    </div>
  );
}
