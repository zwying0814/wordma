import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Site } from "../lib/site";

interface Props {
  sites: Site[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
}

function SiteAvatar({ site, size }: { site: Site; size: number }) {
  return (
    <Avatar
      className="shrink-0 rounded-md after:rounded-md"
      style={{ width: size, height: size }}
    >
      <AvatarFallback
        className={cn(
          "rounded-md bg-accent font-semibold text-accent-foreground",
          size >= 28 ? "text-[13px]" : "text-[12px]",
        )}
      >
        {site.name.slice(0, 1)}
      </AvatarFallback>
    </Avatar>
  );
}

export default function SiteSwitcher({
  sites,
  activeId,
  onSelect,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const active = sites.find((s) => s.id === activeId) ?? sites[0] ?? null;

  if (!active) {
    return null;
  }

  return (
    <div className="mb-3">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label="切换站点"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.045]",
            open && "bg-foreground/[0.045]",
          )}
        >
          <SiteAvatar site={active} size={30} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {active.name}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {active.description || "暂无介绍"}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          {sites.map((site) => (
            <DropdownMenuItem
              key={site.id}
              onClick={() => onSelect(site.id)}
              className="gap-2.5 py-2"
            >
              <SiteAvatar site={site} size={24} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">
                  {site.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {site.description || "暂无介绍"}
                </span>
              </span>
              {site.id === active.id ? (
                <Check className="size-3.5 shrink-0 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCreate} className="gap-2.5 py-2">
            <Plus className="size-3.5 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-medium">新建站点</span>
              <span className="text-[11px] text-muted-foreground">
                独立的内容空间
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
