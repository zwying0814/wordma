import * as React from 'react';

import { ArrowLeft } from 'lucide-react';
import { useLocation, useParams } from 'wouter';

import { ArticleEditor } from '@/components/editor/plate-editor';
import { Button } from '@/components/ui/button';
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
    <div className="flex items-center gap-3 border-b px-3 py-2">
      <Button
        aria-label="Back"
        data-testid="editor-back"
        onClick={() => navigate('/articles')}
        size="icon"
        variant="ghost"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <span className="font-medium text-sm">编辑文章</span>
    </div>
  );

  if (error) {
    return (
      <div className="flex h-screen flex-col">
        {backBar}
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex h-screen flex-col">
        {backBar}
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
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
