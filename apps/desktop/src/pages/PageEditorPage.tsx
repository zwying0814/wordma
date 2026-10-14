import * as React from 'react';

import { ArrowLeft, Dices } from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import type { Value } from 'platejs';
import { createSlateEditor } from 'platejs';
import { serializeHtml } from 'platejs/static';
import { Plate, usePlateEditor } from 'platejs/react';

import { BlogEditorKit } from '@/components/editor/plugins/blog-editor-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/ui/fixed-toolbar-buttons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { generateSlug } from '@/lib/slug';
import { updatePage } from '@/lib/pages';
import type { SitePage } from '@/types/api';
import { FloatingToolbar } from '@/components/ui/floating-toolbar';
import { FloatingToolbarButtons } from '@/components/ui/floating-toolbar-buttons';

function htmlToValue(html: string): Value {
  const container = document.createElement('div');
  container.innerHTML = html;
  const scratch = createSlateEditor({ plugins: BlogEditorKit });
  return scratch.api.html.deserialize({ element: container }) as unknown as Value;
}

/** 独立页面编辑器：/pages/editor/:id */
export function PageEditorPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();

  const [page, setPage] = React.useState<SitePage | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError(null);

    void (async () => {
      try {
        const loaded = await window.api.invoke(
          'get_page',
          { id: Number(id) }
        );
        if (!cancelled) setPage(loaded as SitePage);
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
        data-testid="page-editor-back"
        onClick={() => navigate('/pages')}
        size="icon"
        variant="ghost"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <span className="font-medium text-sm">编辑页面</span>
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

  if (!page) {
    return (
      <div className="flex h-screen flex-col">
        {backBar}
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          加载中…
        </div>
      </div>
    );
  }

  return <PageEditorForm page={page} />;
}

function PageEditorForm({ page }: { page: SitePage }) {
  const [, navigate] = useLocation();
  const [initialValue] = React.useState<Value>(() =>
    htmlToValue(page.content)
  );

  const editor = usePlateEditor(
    { plugins: BlogEditorKit, value: initialValue },
    [page.id, page.updatedAt]
  );

  const [title, setTitle] = React.useState(page.title);
  const [slug, setSlug] = React.useState(page.slug);
  const [showInNav, setShowInNav] = React.useState(page.showInNav);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const html = await serializeHtml(editor);
      const saved = await updatePage({
        id: page.id,
        title: title.trim() || '未命名页面',
        content: html,
        slug: slug.trim() || generateSlug(),
        showInNav,
      });
      setSlug(saved.slug);
      setSavedAt(new Date().toLocaleTimeString('zh-CN'));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      {/* 顶栏：返回 / 标题 / 导航开关 / 保存 */}
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <Button
          aria-label="Back"
          data-testid="page-editor-back"
          onClick={() => navigate('/pages')}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Input
          className="h-8 flex-1 border-none bg-transparent px-1 font-semibold text-base shadow-none focus-visible:ring-0"
          data-testid="page-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="页面标题（≤60 字）"
          value={title}
        />
        <label className="flex items-center gap-1.5 text-muted-foreground text-sm">
          加入导航
          <Switch
            checked={showInNav}
            data-testid="page-show-in-nav"
            onCheckedChange={(checked) => setShowInNav(checked === true)}
          />
        </label>
        {savedAt && (
          <span className="text-muted-foreground text-xs" data-testid="page-saved-at">
            已保存 {savedAt}
          </span>
        )}
        <Button data-testid="page-save" disabled={saving} onClick={() => void handleSave()}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      {/* 元信息栏：slug / 随机 / 排序 */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <span>/</span>
          <Input
            className="h-7 w-44 px-1.5 font-mono text-xs"
            data-testid="page-slug"
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            value={slug}
          />
          <Button
            aria-label="Random slug"
            data-testid="page-slug-random"
            onClick={() => setSlug(generateSlug())}
            size="icon"
            title="随机生成 slug"
            variant="ghost"
          >
            <Dices className="size-3.5" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saveError && (
            <span className="text-destructive text-xs" data-testid="page-save-error">
              {saveError}
            </span>
          )}
        </div>
      </div>

      <Plate editor={editor}>
        <EditorContainer className="min-h-0 flex-1">
          <FixedToolbar className="justify-start gap-1">
            <FixedToolbarButtons />
          </FixedToolbar>
          <Editor variant="demo" placeholder="输入页面内容..." />
          <FloatingToolbar>
            <FloatingToolbarButtons />
          </FloatingToolbar>
        </EditorContainer>
      </Plate>
    </div>
  );
}
