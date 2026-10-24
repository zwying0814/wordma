import { ArrowLeft, FileText, FolderOpen, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import type { WorkspaceInfo } from './api';

type WorkspaceShellProps = {
  workspace: WorkspaceInfo;
  onSwitch: () => void;
};

export function WorkspaceShell({ workspace, onSwitch }: WorkspaceShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="sm" onClick={onSwitch}>
          <ArrowLeft />
          切换空间
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{workspace.name}</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {workspace.path}
          </span>
        </div>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled
            title="设置（即将推出）"
          >
            <Settings />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r p-3 sm:block">
          <Button variant="secondary" size="sm" className="w-full justify-start">
            <FileText />
            全部笔记
          </Button>
        </aside>

        <main className="flex min-w-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FolderOpen className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">笔记空间已打开</h2>
            <p className="text-sm text-muted-foreground">
              接下来会在这里实现笔记列表与编辑器。
            </p>
            <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all text-muted-foreground">
              {workspace.path}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
