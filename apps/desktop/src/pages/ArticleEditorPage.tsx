import * as React from 'react';

import { ArrowLeft } from 'lucide-react';
import { useLocation, useParams } from 'wouter';

import { ArticleEditor } from '@/components/editor/plate-editor';
import { getArticle } from '@/lib/article';
import type { Article } from '@/types/api';
import { useSite } from '@/context/SiteContext';

/** 文章编辑器页：/editor/:id —— 加载文章后进入编辑器 */
export function ArticleEditorPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { reloadArticles } = useSite();

  const [article, setArticle] = React.useState<Article | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setArticle(null);
    setError(null);

    void (async () => {
      try {
        const loaded = await getArticle(Number(id));
        if (!cancelled) setArticle(loaded);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const backBar = (
    <div className="flex items-center gap-2.5 border-b border-border bg-card px-5 py-3">
      <button
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
        data-testid="editor-back"
        onClick={() => navigate('/articles')}
        type="button"
      >
        <ArrowLeft className="size-4" />
        返回列表
      </button>
      <span className="font-semibold text-sm">编辑文章</span>
    </div>
  );

  if (error) {
    return (
      <div className="flex h-screen flex-col">
        {backBar}
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex h-screen flex-col">
        {backBar}
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          加载中…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <ArticleEditor article={article} onSaved={() => void reloadArticles()} />
    </div>
  );
}
