import {
  Clock,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { cn } from 'cn';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/time';

import type { RecentWorkspace } from './api';

type WelcomeScreenProps = {
  workspaces: RecentWorkspace[];
  loading: boolean;
  busy: boolean;
  openingPath: string | null;
  autoOpenLast: boolean;
  onOpenFolder: () => void;
  onOpenWorkspace: (path: string) => void;
  onRemoveWorkspace: (path: string) => void;
  onRevealWorkspace: (path: string) => void;
  onAutoOpenLastChange: (enabled: boolean) => void;
};

export function WelcomeScreen({
  workspaces,
  loading,
  busy,
  openingPath,
  autoOpenLast,
  onOpenFolder,
  onOpenWorkspace,
  onRemoveWorkspace,
  onRevealWorkspace,
  onAutoOpenLastChange,
}: WelcomeScreenProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 px-6 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <FolderOpen className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Wordma</h1>
          <p className="text-sm text-muted-foreground">本地优先的写作空间</p>
        </header>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>笔记空间</CardTitle>
                <CardDescription>
                  选择一个本地文件夹，内容只保存在你的磁盘上。
                </CardDescription>
              </div>
              <Button onClick={onOpenFolder} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
                打开文件夹
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5" />
              最近打开
            </div>
            <Separator />

            {loading ? (
              <RecentSkeleton />
            ) : workspaces.length === 0 ? (
              <EmptyRecents onOpenFolder={onOpenFolder} disabled={busy} />
            ) : (
              <ScrollArea className="max-h-[340px]">
                <div className="space-y-1 pr-2">
                  {workspaces.map((workspace) => (
                    <RecentRow
                      key={workspace.path}
                      workspace={workspace}
                      busy={busy}
                      opening={openingPath === workspace.path}
                      onOpen={onOpenWorkspace}
                      onRemove={onRemoveWorkspace}
                      onReveal={onRevealWorkspace}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            id="auto-open-last"
            checked={autoOpenLast}
            onCheckedChange={(checked) => onAutoOpenLastChange(checked)}
          />
          <label htmlFor="auto-open-last" className="cursor-pointer select-none">
            启动时自动打开上次的笔记空间
          </label>
        </div>
      </div>
    </div>
  );
}

type RecentRowProps = {
  workspace: RecentWorkspace;
  busy: boolean;
  opening: boolean;
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
  onReveal: (path: string) => void;
};

function RecentRow({
  workspace,
  busy,
  opening,
  onOpen,
  onRemove,
  onReveal,
}: RecentRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg transition-colors',
        workspace.exists ? 'hover:bg-muted' : 'opacity-60',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        onClick={() => onOpen(workspace.path)}
        disabled={busy}
        title={workspace.path}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {opening ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Folder className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{workspace.name}</span>
            {!workspace.exists && <Badge variant="outline">不可用</Badge>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {workspace.path}
          </span>
        </span>
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title={new Date(workspace.lastOpenedAt).toLocaleString()}
        >
          {formatRelativeTime(workspace.lastOpenedAt)}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="更多操作" />}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onReveal(workspace.path)}>
            <ExternalLink />
            在文件管理器中显示
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onRemove(workspace.path)}
          >
            <Trash2 />
            从列表移除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmptyRecents({
  onOpenFolder,
  disabled,
}: {
  onOpenFolder: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FolderPlus className="size-5" />
      </div>
      <p className="text-sm font-medium">还没有笔记空间</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        选择一个本地文件夹作为你的写作空间。
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={onOpenFolder}
        disabled={disabled}
      >
        选择文件夹
      </Button>
    </div>
  );
}

function RecentSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
