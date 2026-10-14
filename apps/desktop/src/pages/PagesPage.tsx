import * as React from 'react';

import { PenLine, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import { createPage, deletePage, listPages } from '@/lib/pages';
import type { SitePage } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 独立页面列表：/pages */
export function PagesPage() {
  const { activeSite } = useSite();
  const [, navigate] = useLocation();

  const [pages, setPages] = React.useState<SitePage[]>([]);
  const [pendingDelete, setPendingDelete] = React.useState<SitePage | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (activeSite === null) {
      setPages([]);
      return;
    }
    setPages(await listPages(activeSite.id));
  }, [activeSite]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!activeSite) return;
    const page = await createPage({ siteId: activeSite.id });
    await reload();
    navigate(`/pages/editor/${page.id}`);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deletePage(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-8" data-testid="pages-page">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-xl tracking-tight">页面</h1>
        <Button data-testid="create-page" onClick={() => void handleCreate()}>
          <Plus className="size-4" />
          新建页面
        </Button>
      </div>

      {pages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p>还没有独立页面（例如“关于我”）。</p>
          <Button onClick={() => void handleCreate()} variant="outline">
            <Plus className="size-4" />
            新建页面
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {pages.map((page) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
              data-testid={`page-item-${page.slug}`}
              key={page.id}
            >
              <div className="min-w-0">
                <button
                  className="block max-w-full truncate font-medium hover:underline"
                  onClick={() => navigate(`/pages/editor/${page.id}`)}
                  type="button"
                >
                  {page.title}
                  {page.showInNav && (
                    <Badge className="ml-2" variant="secondary">
                      导航
                    </Badge>
                  )}
                </button>
                <span className="block truncate text-muted-foreground text-xs">
                  /{page.slug} · 更新于 {formatDateTime(page.updatedAt)}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  aria-label={`编辑 ${page.title}`}
                  onClick={() => navigate(`/pages/editor/${page.id}`)}
                  size="icon"
                  variant="ghost"
                >
                  <PenLine className="size-4" />
                </Button>
                <Button
                  aria-label={`删除 ${page.title}`}
                  onClick={() => setPendingDelete(page)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <DialogContent className="max-w-[420px]">
          <DialogTitle>删除页面</DialogTitle>
          <DialogDescription>
            确认删除页面「{pendingDelete?.title}」？此操作不可撤销。
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(null)} variant="ghost">
              取消
            </Button>
            <Button
              data-testid="confirm-delete-page"
              disabled={deleting}
              onClick={() => void handleDelete()}
              variant="destructive"
            >
              {deleting ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
