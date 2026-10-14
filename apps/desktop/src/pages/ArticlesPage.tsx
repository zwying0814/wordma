import * as React from 'react';

import { PenLine, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import { createArticle, deleteArticle } from '@/lib/article';
import type { Article } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type StatusFilter = 'all' | 'draft' | 'published';

const filters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 文章列表页：/articles */
export function ArticlesPage() {
  const { activeSite, articles, reloadArticles } = useSite();
  const [, navigate] = useLocation();

  const [filter, setFilter] = React.useState<StatusFilter>('all');
  const [pendingDelete, setPendingDelete] = React.useState<Article | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const filtered =
    filter === 'all'
      ? articles
      : articles.filter((article) => article.status === filter);

  const handleCreate = async () => {
    if (!activeSite) return;
    const article = await createArticle({ siteId: activeSite.id });
    await reloadArticles();
    void article;
    navigate(`/editor/${article.id}`);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteArticle(pendingDelete.id);
      setPendingDelete(null);
      await reloadArticles();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-8" data-testid="articles-page">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-xl tracking-tight">文章</h1>
        <Button data-testid="create-article" onClick={handleCreate}>
          <Plus className="size-4" />
          新建文章
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-1">
        {filters.map(({ value, label }) => (
          <Button
            key={value}
            onClick={() => setFilter(value)}
            size="sm"
            variant={filter === value ? 'secondary' : 'ghost'}
          >
            {label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p>{filter === 'all' ? '还没有文章，从第一篇开始吧。' : '该状态下暂无文章。'}</p>
          {filter === 'all' && (
            <Button onClick={handleCreate} variant="outline">
              <Plus className="size-4" />
              新建文章
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>标签</TableHead>
                <TableHead className="w-36">更新时间</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((article) => (
                <TableRow key={article.id}>
                  <TableCell className="max-w-0">
                    <button
                      className="block max-w-full truncate font-medium hover:underline"
                      onClick={() => navigate(`/editor/${article.id}`)}
                      type="button"
                    >
                      {article.title}
                    </button>
                    <span className="block truncate text-muted-foreground text-xs">
                      /{article.slug}
                    </span>
                  </TableCell>
                  <TableCell>
                    {article.status === 'published' ? (
                      <Badge>已发布</Badge>
                    ) : (
                      <Badge variant="secondary">草稿</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground text-sm">
                    {article.categories.map((c) => c.name).join('、') || '—'}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-muted-foreground text-sm">
                    {article.tags.map((t) => t.name).join('、') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(article.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        aria-label={`编辑 ${article.title}`}
                        onClick={() => navigate(`/editor/${article.id}`)}
                        size="icon"
                        variant="ghost"
                      >
                        <PenLine className="size-4" />
                      </Button>
                      <Button
                        aria-label={`删除 ${article.title}`}
                        onClick={() => setPendingDelete(article)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <DialogContent className="max-w-[420px]">
          <DialogTitle>删除文章</DialogTitle>
          <DialogDescription>
            确认删除文章「{pendingDelete?.title}」？此操作不可撤销。
          </DialogDescription>
          <DialogFooter>
            <Button
              onClick={() => setPendingDelete(null)}
              variant="ghost"
            >
              取消
            </Button>
            <Button
              data-testid="confirm-delete-article"
              disabled={deleting}
              onClick={handleDelete}
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
