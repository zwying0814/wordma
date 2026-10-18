import * as React from 'react';

import { Inbox, PenLine } from 'lucide-react';
import { useLocation } from 'wouter';

import { useSite } from '@/context/SiteContext';
import { createArticle } from '@/lib/article';
import { countWordsInHtml } from '@/lib/words';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardList, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader, StatCard } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/chip';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 概览页：/dashboard —— 问候 + 统计 + 最近编辑 */
export function DashboardPage() {
  const { activeSite, articles, reloadArticles } = useSite();
  const [, navigate] = useLocation();
  const [creating, setCreating] = React.useState(false);

  const published = articles.filter((a) => a.status === 'published').length;
  const drafts = articles.length - published;
  const words = articles.reduce(
    (total, a) => total + countWordsInHtml(a.content),
    0
  );
  const recent = [...articles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const handleCreate = async () => {
    if (!activeSite) return;
    setCreating(true);
    try {
      const article = await createArticle({ siteId: activeSite.id });
      await reloadArticles();
      navigate(`/editor/${article.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col p-9" data-testid="dashboard-page">
      <PageHeader
        actions={
          <Button
            data-testid="dashboard-create-article"
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            <PenLine className="size-4" />
            写一篇文章
          </Button>
        }
        subtitle={
          articles.length > 0
            ? `「${activeSite?.name ?? ''}」一切井然有序，继续写吧。`
            : `「${activeSite?.name ?? ''}」还是一片空白，从第一篇开始。`
        }
        title={greeting()}
      />

      <div className="mb-7 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard caption="文章总数" value={articles.length} />
        <StatCard caption="已发布" value={published} />
        <StatCard caption="草稿箱" value={drafts} />
        <StatCard caption="总字数" value={words.toLocaleString('zh-CN')} />
      </div>

      {recent.length === 0 ? (
        <Card>
          <EmptyState
            description="写下第一篇，从这个站点开始积累。"
            icon={Inbox}
            title="还没有文章"
          >
            <Button onClick={() => void handleCreate()}>
              <PenLine className="size-4" />
              写一篇文章
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>最近编辑</CardTitle>
          </CardHeader>
          <CardList>
            {recent.map((article) => (
              <ListRow
                actions={<StatusChip status={article.status} />}
                key={article.id}
                meta={`${article.categories.map((c) => c.name).join('、') || '未分类'} · ${formatDate(article.updatedAt)} · 约 ${countWordsInHtml(article.content).toLocaleString('zh-CN')} 字`}
                onClick={() => navigate(`/editor/${article.id}`)}
                title={article.title || '（无标题）'}
              />
            ))}
          </CardList>
        </Card>
      )}
    </div>
  );
}
