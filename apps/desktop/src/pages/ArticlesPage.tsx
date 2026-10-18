import * as React from 'react';

import { FileText, PenLine, Plus, Search, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import { createArticle, deleteArticle } from '@/lib/article';
import { countWordsInHtml } from '@/lib/words';
import type { Article } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card, CardList } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';

type StatusFilter = 'all' | 'draft' | 'published';

const filters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 文章列表页：/articles —— 状态筛选 + 搜索 + 行列表 */
export function ArticlesPage() {
  const { activeSite, articles, reloadArticles } = useSite();
  const [, navigate] = useLocation();

  const [filter, setFilter] = React.useState<StatusFilter>('all');
  const [query, setQuery] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<Article | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const keyword = query.trim().toLowerCase();
  const filtered = articles.filter((article) => {
    if (filter !== 'all' && article.status !== filter) return false;
    if (!keyword) return true;
    return (
      article.title.toLowerCase().includes(keyword) ||
      article.slug.toLowerCase().includes(keyword) ||
      article.tags.some((t) => t.name.toLowerCase().includes(keyword)) ||
      article.categories.some((c) => c.name.toLowerCase().includes(keyword))
    );
  });

  const handleCreate = async () => {
    if (!activeSite || creating) return;
    setCreating(true);
    try {
      const article = await createArticle({ siteId: activeSite.id });
      await reloadArticles();
      navigate(`/editor/${article.id}`);
    } finally {
      setCreating(false);
    }
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

  const listMeta = (article: Article) => {
    const bits: string[] = [];
    const categories = article.categories.map((c) => c.name).join('、');
    if (categories) bits.push(categories);
    const tags = article.tags.map((t) => t.name).join(' · ');
    if (tags) bits.push(tags);
    bits.push(formatDate(article.updatedAt));
    bits.push(`约 ${countWordsInHtml(article.content).toLocaleString('zh-CN')} 字`);
    return bits.join(' · ');
  };

  return (
    <div className="flex flex-col p-9" data-testid="articles-page">
      <PageHeader
        actions={
          <Button
            data-testid="create-article"
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            <Plus className="size-4" />
            新建文章
          </Button>
        }
        subtitle={`共 ${articles.length} 篇 · ${activeSite?.name ?? ''}`}
        title="文章"
      />

      <div className="mb-3.5 flex items-center gap-3">
        <Segmented
          aria-label="状态筛选"
          onValueChange={setFilter}
          options={filters}
          value={filter}
        />
        <div className="relative ml-auto w-56 max-w-[45%]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索文章"
            className="pl-9"
            data-testid="articles-search"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、标签或分类…"
            type="search"
            value={query}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            description={
              articles.length === 0
                ? '第一篇文章往往最难，也最重要。'
                : '换个关键词，或清除筛选条件试试。'
            }
            icon={articles.length === 0 ? FileText : Search}
            title={articles.length === 0 ? '还没有文章' : '没有匹配的文章'}
          >
            {articles.length === 0 && (
              <Button onClick={() => void handleCreate()}>
                <Plus className="size-4" />
                写一篇文章
              </Button>
            )}
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardList>
            {filtered.map((article) => (
              <ListRow
                actions={
                  <>
                    <StatusChip status={article.status} />
                    <Button
                      aria-label={`编辑 ${article.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/editor/${article.id}`);
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <PenLine />
                    </Button>
                    <Button
                      aria-label={`删除 ${article.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDelete(article);
                      }}
                      size="icon-sm"
                      variant="destructiveGhost"
                    >
                      <Trash2 />
                    </Button>
                  </>
                }
                data-testid={`article-row-${article.id}`}
                key={article.id}
                meta={listMeta(article)}
                onClick={() => navigate(`/editor/${article.id}`)}
                title={article.title || '（无标题）'}
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
          <DialogTitle>删除文章</DialogTitle>
          <DialogDescription>
            确认删除文章「{pendingDelete?.title}」？此操作不可撤销。
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(null)} variant="outline">
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
