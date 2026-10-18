import { Check, ChevronDown, Plus } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** 站点首字母头像（design .avatar）：按站点 id 轮换三种柔和底色 */
function SiteAvatar({
  className,
  name,
  siteId,
}: {
  className?: string;
  name: string;
  siteId: number;
}) {
  const hues = [
    'bg-primary/10 text-primary',
    'bg-success/12 text-success',
    'bg-warning/12 text-warning',
  ];

  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg font-semibold text-sm',
        hues[siteId % hues.length],
        className
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** 侧边栏顶部的站点切换器（design .switcher-btn / .dropdown） */
export function SiteSwitcher() {
  const { activeSite, articles, setActiveSite, sites } = useSite();
  const [, navigate] = useLocation();

  if (!activeSite) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 outline-none hover:bg-accent"
            data-testid="site-switcher"
            type="button"
          >
            <SiteAvatar name={activeSite.name} siteId={activeSite.id} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-sm">
                {activeSite.name}
              </span>
              <span className="block text-muted-foreground text-xs">
                {articles.length} 篇文章
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-60">
        {sites.map((site) => (
          <DropdownMenuItem
            key={site.id}
            onClick={() => {
              if (site.id === activeSite.id) return;
              void setActiveSite(site.id).then(() => navigate('/dashboard'));
            }}
          >
            <SiteAvatar className="size-6 rounded-md text-xs" name={site.name} siteId={site.id} />
            <span className="min-w-0 flex-1 truncate">{site.name}</span>
            <Check
              className={cn(
                'size-4 shrink-0 text-primary',
                site.id === activeSite.id ? 'opacity-100' : 'opacity-0'
              )}
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigate('/settings');
          }}
        >
          <Plus className="size-4" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">新建站点</span>
            <span className="block text-muted-foreground text-xs">
              独立的内容空间
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
