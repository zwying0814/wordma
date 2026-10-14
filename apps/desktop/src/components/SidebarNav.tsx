import {
  FileText,
  Files,
  Image as ImageIcon,
  Settings,
  Tags,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';

const items = [
  { href: '/articles', icon: FileText, label: '文章' },
  { href: '/pages', icon: Files, label: '页面' },
  { href: '/taxonomy', icon: Tags, label: '分类与标签' },
  { href: '/media', icon: ImageIcon, label: '媒体库' },
  { href: '/settings', icon: Settings, label: '设置' },
];

/** 侧边导航（一期页面入口；未实现的页面显示建设中占位） */
export function SidebarNav() {
  const [location] = useLocation();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map(({ href, icon: Icon, label }) => {
        const isActive = location === href;
        return (
          <Link
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground'
            }`}
            data-testid={`nav-${href.slice(1)}`}
            href={href}
            key={href}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
