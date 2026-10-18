'use client';

import * as React from 'react';

import { createStaticEditor, serializeHtml } from 'platejs/static';
import { createSlateEditor, type Value } from 'platejs';
import { ArrowLeftIcon, ChevronDown, Dices, Folder, Tag } from 'lucide-react';
import { Plate, useEditorSelector, usePlateEditor } from 'platejs/react';
import { useLocation } from 'wouter';

import { errorMessage } from '@/lib/errors';
import { generateSlug } from '@/lib/slug';
import { countWords } from '@/lib/words';
import { updateArticle } from '@/lib/article';
import { listCategories, listTags } from '@/lib/taxonomy';
import type { Article } from '@/types/api';

import { BlogEditorBaseKit } from '@/components/editor/plugins/blog-editor-base-kit';
import { BlogEditorKit } from './plugins/blog-editor-kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { EditorStatic } from '@/components/ui/editor-static';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/ui/fixed-toolbar-buttons';
import { FloatingToolbar } from '@/components/ui/floating-toolbar';
import { FloatingToolbarButtons } from '@/components/ui/floating-toolbar-buttons';

/** 文章 HTML → 编辑器初始 value（用一次性 headless 编辑器反序列化） */
function htmlToValue(html: string): Value {
  const container = document.createElement('div');
  container.innerHTML = html;
  const scratch = createSlateEditor({ plugins: BlogEditorKit });
  return scratch.api.html.deserialize({ element: container }) as unknown as Value;
}

/** 实时字数（剥除空白后的非空白字符数） */
function WordCount() {
  const count = useEditorSelector(
    (editor) => countWords(editor.api.string([])),
    []
  );

  return (
    <span className="text-muted-foreground text-xs" data-testid="word-count">
      {count} 字
    </span>
  );
}

/** 文章编辑器本体：顶栏 + 元信息栏 + 编辑器（须在文章数据加载完成后渲染） */
export function ArticleEditor({
  article,
  onSaved,
}: {
  article: Article;
  onSaved?: () => void;
}) {
  const [, navigate] = useLocation();
  const [initialValue] = React.useState<Value>(() =>
    htmlToValue(article.content)
  );

  const editor = usePlateEditor(
    { plugins: BlogEditorKit, value: initialValue },
    [article.id, article.updatedAt]
  );


  const [title, setTitle] = React.useState(article.title);
  const [slug, setSlug] = React.useState(article.slug);
  const [status, setStatus] = React.useState(article.status);
  const [categoryIds, setCategoryIds] = React.useState<number[]>(
    article.categories.map((c) => c.id)
  );
  const [tagIds, setTagIds] = React.useState<number[]>(
    article.tags.map((t) => t.id)
  );
  const [tags, setTags] = React.useState<
    { id: number; name: string }[]
  >([]);
  const [categories, setCategories] = React.useState<
    { id: number; name: string }[]
  >([]);
  const [saving, setSaving] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  // 分类/标签候选列表
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [tagList, categoryList] = await Promise.all([
          listTags(article.siteId),
          listCategories(article.siteId),
        ]);
        if (!cancelled) {
          setTags(tagList);
          setCategories(categoryList);
        }
      } catch (err) {
        console.error('加载分类/标签失败:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [article.siteId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // 用 base 插件的静态编辑器序列化：零上下文 hook、零告警
      // （组件为 *-static.tsx 静态版，结构/样式与实时渲染等价）
      const staticEditor = createStaticEditor({
        plugins: BlogEditorBaseKit,
        value: editor.children,
      });
      const html = await serializeHtml(staticEditor, {
        editorComponent: EditorStatic,
        props: { style: { padding: 0 } },
      });
      const saved = await updateArticle({
        id: article.id,
        title: title.trim() || '未命名文章',
        content: html,
        status,
        slug: slug.trim() || generateSlug(),
        categoryIds,
        tagIds,
      });
      setSlug(saved.slug);
      setSavedAt(new Date().toLocaleTimeString('zh-CN'));
      onSaved?.();
      return saved.slug;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** 预览 = 先保存（渲染读的是库里的内容）→ 渲染整站 → 浏览器直接打开这篇文章 */
  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const savedSlug = await handleSave();
      if (!savedSlug) return;
      await window.api.invoke('open_preview', {
        siteId: article.siteId,
        target: { kind: 'post', slug: savedSlug },
      });
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setPreviewing(false);
    }
  };

  const toggleStatus = async () => {
    const next = status === 'draft' ? 'published' : 'draft';
    const prev = status;
    setStatus(next);
    try {
      await updateArticle({ id: article.id, status: next });
      onSaved?.();
    } catch (err) {
      setStatus(prev);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleId = (ids: number[], id: number): number[] =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  return (
    <Plate editor={editor}>
      {/* 顶栏：返回 / 标题 / 状态 / 保存（design .editor-top） */}
      <div className="flex items-center gap-2.5 border-b border-border bg-card px-5 py-3">
        <button
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
          data-testid="editor-back"
          onClick={() => navigate('/articles')}
          type="button"
        >
          <ArrowLeftIcon className="size-4" />
          返回列表
        </button>
        <Input
          className="h-8 flex-1 border-none bg-transparent px-1 font-bold text-lg shadow-none focus-visible:ring-0"
          data-testid="article-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="文章标题"
          value={title}
        />
        <button
          className="cursor-pointer"
          data-testid="article-status"
          onClick={() => void toggleStatus()}
          title="点击切换草稿/已发布"
          type="button"
        >
          <Badge variant={status === 'published' ? 'default' : 'muted'}>
            {status === 'published' ? '已发布' : '草稿'}
          </Badge>
        </button>
        {savedAt && (
          <span className="text-muted-foreground text-xs" data-testid="saved-at">
            已保存 {savedAt}
          </span>
        )}
        <Button
          data-testid="article-preview"
          disabled={saving || previewing}
          onClick={() => void handlePreview()}
          size="sm"
          variant="outline"
        >
          {previewing ? '预览中…' : '预览'}
        </Button>
        <Button
          data-testid="article-save"
          disabled={saving || previewing}
          onClick={() => void handleSave()}
          size="sm"
        >
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      {/* 元信息栏：slug / 分类 / 标签 / 字数 */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-5 py-2">
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <span>/</span>
          <Input
            className="h-7 w-44 px-1.5 font-mono text-xs"
            data-testid="article-slug"
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
            value={slug}
          />
          <Button
            aria-label="Random slug"
            data-testid="article-slug-random"
            onClick={() => setSlug(generateSlug())}
            size="icon"
            title="随机生成 slug"
            variant="ghost"
          >
            <Dices className="size-3.5" />
          </Button>
        </div>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button
                className="rounded-full border border-input px-2.5"
                data-testid="category-selector"
                size="sm"
                variant="outline"
              >
                <Folder className="size-3.5" />
                {categories
                  .filter((c) => categoryIds.includes(c.id))
                  .map((c) => c.name)
                  .join('、') || '选择分类'}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="max-h-72 w-44 overflow-y-auto">
            {categories.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-sm">
                暂无分类
              </div>
            )}
            {categories.map((category) => (
              <DropdownMenuCheckboxItem
                checked={categoryIds.includes(category.id)}
                key={category.id}
                onCheckedChange={() =>
                  setCategoryIds((prev) => toggleId(prev, category.id))
                }
              >
                {category.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button
                className="rounded-full border border-input px-2.5"
                data-testid="tag-selector"
                size="sm"
                variant="outline"
              >
                <Tag className="size-3.5" />
                {tags
                  .filter((t) => tagIds.includes(t.id))
                  .map((t) => t.name)
                  .slice(0, 2)
                  .join('、') || '添加标签'}
                {tagIds.length > 2 && ` +${tagIds.length - 2}`}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="max-h-72 w-44 overflow-y-auto">
            {tags.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-sm">
                暂无标签
              </div>
            )}
            {tags.map((tag) => (
              <DropdownMenuCheckboxItem
                checked={tagIds.includes(tag.id)}
                key={tag.id}
                onCheckedChange={() => setTagIds((prev) => toggleId(prev, tag.id))}
              >
                {tag.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {saveError && (
            <span className="text-destructive text-xs" data-testid="save-error">
              {saveError}
            </span>
          )}
          <WordCount />
        </div>
      </div>

      <EditorContainer className="min-h-0 flex-1">
        <FixedToolbar className="justify-start gap-1">
          <FixedToolbarButtons />
        </FixedToolbar>
        <Editor variant="demo" placeholder="输入您精彩的内容..." />
        <FloatingToolbar>
          <FloatingToolbarButtons />
        </FloatingToolbar>
      </EditorContainer>
    </Plate>
  );
}
