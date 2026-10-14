'use client';

import * as React from 'react';

import { createSlateEditor, DebugPlugin } from 'platejs';
import { serializeHtml } from 'platejs/static';
import type { Value } from 'platejs';
import { ArrowLeftIcon, ChevronDown, Dices } from 'lucide-react';
import { Plate, useEditorSelector, usePlateEditor } from 'platejs/react';
import { useLocation } from 'wouter';

import { generateSlug } from '@/lib/slug';
import { countWords } from '@/lib/words';
import { updateArticle } from '@/lib/article';
import { listCategories, listTags } from '@/lib/taxonomy';
import type { Article } from '@/types/api';

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
      // serializeHtml 以静态方式渲染节点组件，plate hooks 脱离节点上下文会产生
      // [USE_ELEMENT_CONTEXT] 告警（输出不受影响，默认值已验证正确）。
      // 序列化期间临时提升日志级别，完成后恢复。
      const prevLogLevel = editor.getOption(DebugPlugin, 'logLevel');
      editor.setOption(DebugPlugin, 'logLevel', 'error');
      try {
        const html = await serializeHtml(editor);
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
      } finally {
        editor.setOption(DebugPlugin, 'logLevel', prevLogLevel ?? 'warn');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
      {/* 顶栏：返回 / 标题 / 状态 / 保存 */}
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <Button
          aria-label="Back"
          data-testid="editor-back"
          onClick={() => navigate('/articles')}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Input
          className="h-8 flex-1 border-none bg-transparent px-1 font-semibold text-base shadow-none focus-visible:ring-0"
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
          <Badge variant={status === 'published' ? 'default' : 'secondary'}>
            {status === 'published' ? '已发布' : '草稿'}
          </Badge>
        </button>
        {savedAt && (
          <span className="text-muted-foreground text-xs" data-testid="saved-at">
            已保存 {savedAt}
          </span>
        )}
        <Button
          data-testid="article-save"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      {/* 元信息栏：slug / 分类 / 标签 / 字数 */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
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
                data-testid="category-selector"
                size="sm"
                variant="ghost"
              >
                分类
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
              <Button data-testid="tag-selector" size="sm" variant="ghost">
                标签
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
