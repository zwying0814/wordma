import {
  FileText,
  Files,
  Folder,
  Image as ImageIcon,
  LayoutDashboard,
  Palette,
  Settings,
  Tags,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import { cn } from '@/lib/utils';

/** 侧边导航（design .nav）：图标 + 名称 + 计数，选中态用主色浅底 */
export function SidebarNav() {
  const [location] = useLocation();
  const { articles, categoryCount, tagCount } = useSite();

  const items = [
    { href: '/dashboard', icon: LayoutDashboard, label: '概览' },
    { href: '/articles', icon: FileText, label: '文章', count: articles.length },
    { href: '/pages', icon: Files, label: '页面' },
    { href: '/tags', icon: Tags, label: '标签', count: tagCount },
    { href: '/categories', icon: Folder, label: '分类', count: categoryCount },
    { href: '/themes', icon: Palette, label: '主题' },
    { href: '/media', icon: ImageIcon, label: '媒体库' },
    { href: '/settings', icon: Settings, label: '设置' },
  ];

  return (
    <nav aria-label="主导航" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
      {items.map(({ href, icon: Icon, label, count }) => {
        const isActive = location === href;
        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium text-sm transition-colors duration-150',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/85 hover:bg-accent hover:text-foreground'
            )}
            data-testid={`nav-${href.slice(1)}`}
            href={href}
            key={href}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-xs leading-5 tabular-nums',
                  isActive
                    ? 'bg-primary/15 text-sidebar-accent-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
