import * as React from 'react';

import { Files, PenLine, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import { createPage, deletePage, listPages } from '@/lib/pages';
import type { SitePage } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardList } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';

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
    <div className="flex flex-col p-9" data-testid="pages-page">
      <PageHeader
        actions={
          <Button data-testid="create-page" onClick={() => void handleCreate()}>
            <Plus className="size-4" />
            新建页面
          </Button>
        }
        subtitle={`共 ${pages.length} 个 · 独立页面（关于、友链等）`}
        title="页面"
      />

      {pages.length === 0 ? (
        <Card>
          <EmptyState
            description="独立页面不会出现在文章列表里，适合「关于我」「友链」这类固定内容。"
            icon={Files}
            title="还没有独立页面"
          >
            <Button onClick={() => void handleCreate()}>
              <Plus className="size-4" />
              新建页面
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardList>
            {pages.map((page) => (
              <ListRow
                actions={
                  <>
                    {page.showInNav && <Chip variant="accent">导航</Chip>}
                    <Button
                      aria-label={`编辑 ${page.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/pages/editor/${page.id}`);
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <PenLine />
                    </Button>
                    <Button
                      aria-label={`删除 ${page.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDelete(page);
                      }}
                      size="icon-sm"
                      variant="destructiveGhost"
                    >
                      <Trash2 />
                    </Button>
                  </>
                }
                data-testid={`page-item-${page.slug}`}
                key={page.id}
                meta={`/${page.slug} · 更新于 ${formatDateTime(page.updatedAt)}`}
                onClick={() => navigate(`/pages/editor/${page.id}`)}
                title={page.title}
              />
            ))}
          </CardList>
        </Card>
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
            <Button onClick={() => setPendingDelete(null)} variant="outline">
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
