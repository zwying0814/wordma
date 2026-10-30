import {
  FileStack,
  FileText,
  Folder,
  Image as ImageIcon,
  LayoutDashboard,
  Palette,
  Settings,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useSite } from "../context/SiteContext";

const ITEMS: { key: string; icon: LucideIcon; label: string; count?: boolean }[] =
  [
    { key: "/", icon: LayoutDashboard, label: "仪表盘" },
    { key: "/articles", icon: FileText, label: "文章", count: true },
    { key: "/tags", icon: Tags, label: "标签", count: true },
    { key: "/categories", icon: Folder, label: "分类", count: true },
    { key: "/media", icon: ImageIcon, label: "媒体库", count: true },
    { key: "/pages", icon: FileStack, label: "页面" },
    { key: "/themes", icon: Palette, label: "主题" },
    { key: "/settings", icon: Settings, label: "设置" },
  ];

export default function SidebarNav() {
  const { articles, tags, categories, media } = useSite();
  const [location, navigate] = useLocation();

  const counts: Record<string, number> = {
    "/articles": articles.length,
    "/tags": tags.length,
    "/categories": categories.length,
    "/media": media.length,
  };

  const selectedKey =
    location.startsWith("/articles") || location.startsWith("/editor")
      ? "/articles"
      : location.startsWith("/media")
        ? "/media"
        : location.startsWith("/pages")
          ? "/pages"
          : location.startsWith("/themes")
            ? "/themes"
            : location.startsWith("/settings")
              ? "/settings"
              : location.startsWith("/tags")
                ? "/tags"
                : location.startsWith("/categories")
                  ? "/categories"
                  : "/";

  return (
    <nav className="flex flex-col gap-0.5" aria-label="主导航">
      {ITEMS.map(({ key, icon: Icon, label, count }) => {
        const active = key === selectedKey;
        return (
          <button
            key={key}
            type="button"
            onClick={() => navigate(key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-[9px] text-[13.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.045]",
              active &&
                "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {count ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-[7px] text-[11px] leading-[18px] text-muted-foreground",
                  active
                    ? "bg-primary/15 text-accent-foreground"
                    : "bg-foreground/5",
                )}
              >
                {counts[key] ?? 0}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
