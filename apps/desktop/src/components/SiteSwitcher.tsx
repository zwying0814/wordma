import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** 侧边栏顶部的站点切换器 */
export function SiteSwitcher() {
  const { activeSite, sites, setActiveSite } = useSite();
  const [, navigate] = useLocation();

  if (!activeSite) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left font-semibold text-sm outline-none hover:bg-accent"
            data-testid="site-switcher"
            type="button"
          >
            <span className="truncate">{activeSite.name}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-52">
        {sites.map((site) => (
          <DropdownMenuItem
            key={site.id}
            onClick={() => {
              void setActiveSite(site.id);
            }}
          >
            <Check
              className={
                site.id === activeSite.id ? 'opacity-100' : 'opacity-0'
              }
            />
            <span className="truncate">{site.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigate('/settings');
          }}
        >
          <Plus />
          新建站点
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
