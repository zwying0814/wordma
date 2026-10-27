import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createNote,
  workspaceErrorMessage,
} from '@/features/workspace/files';
import type {
  EngineInspectResult,
  EnginePageType,
} from '@/features/engine/api';

type CreateNoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
  inspect: EngineInspectResult | null;
  onCreated: (path: string) => Promise<void>;
};

function slugify(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function collectionFor(pageType: EnginePageType): string {
  return pageType.collection ?? 'pages';
}

function routeFor(
  pageType: EnginePageType,
  slug: string,
): string {
  return pageType.route.replace(
    /\[slug\]/g,
    slug || '[slug]',
  );
}

export function CreateNoteDialog({
  open,
  onOpenChange,
  workspacePath,
  inspect,
  onCreated,
}: CreateNoteDialogProps) {
  const [selectedId, setSelectedId] = useState<
    string | null
  >(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collections = useMemo(
    () =>
      new Set(
        (inspect?.collections ?? []).map(
          (collection) => collection.name,
        ),
      ),
    [inspect],
  );

  const pageTypes = inspect?.pageTypes ?? [];
  const selected = pageTypes.find(
    (pageType) => pageType.id === selectedId,
  );
  const collection = selected
    ? collectionFor(selected)
    : '';
  const collectionExists =
    collection.length > 0 && collections.has(collection);

  useEffect(() => {
    if (!open) return;

    setTitle('');
    setSlug('');
    setSlugTouched(false);
    setCreating(false);
    setError(null);

    const first = pageTypes.find((pageType) =>
      collections.has(collectionFor(pageType)),
    );
    setSelectedId(first?.id ?? null);
  }, [open, pageTypes, collections]);

  useEffect(() => {
    if (!open || slugTouched) return;
    setSlug(slugify(title));
  }, [open, slugTouched, title]);

  const titleError = useMemo(() => {
    if (title.length === 0) return undefined;
    if (title.trim().length === 0) {
      return '标题不能为空';
    }
    if (title.length > 200) {
      return '标题不能超过 200 个字符';
    }
    return undefined;
  }, [title]);

  const slugError = useMemo(() => {
    if (slug.length === 0) {
      return slugTouched ? 'slug 不能为空' : undefined;
    }
    if (slug.length > 120) {
      return 'slug 不能超过 120 个字符';
    }
    if (slug !== slugify(slug)) {
      return 'slug 只能包含小写字母、数字、Unicode 字母和 -';
    }
    return undefined;
  }, [slug, slugTouched]);

  const conflict = useMemo(() => {
    if (!selected || !inspect || slug.length === 0) {
      return undefined;
    }

    if (!selected.route.includes('[slug]')) {
      const existing = inspect.entries.find(
        (entry) => entry.type === selected.id,
      );
      if (existing) {
        return `页面类型 ${selected.label} 的路由已被“${existing.title}”占用`;
      }
    }

    const sameSlug = inspect.entries.find(
      (entry) =>
        entry.collection === collection &&
        entry.slug === slug,
    );
    if (sameSlug) {
      return `slug 已存在：${sameSlug.relativePath}`;
    }

    return undefined;
  }, [collection, inspect, selected, slug]);

  const canCreate =
    !creating &&
    selected !== undefined &&
    collectionExists &&
    title.trim().length > 0 &&
    title.length <= 200 &&
    slug.length > 0 &&
    slug.length <= 120 &&
    slugError === undefined &&
    conflict === undefined;

  const handleCreate = async () => {
    if (!selected || !canCreate) return;

    setCreating(true);
    setError(null);

    try {
      const created = await createNote({
        root: workspacePath,
        collection,
        slug,
        title: title.trim(),
        pageType: selected.id,
      });
      toast.success('已创建笔记');
      await onCreated(created.path);
      onOpenChange(false);
    } catch (createError) {
      const message = workspaceErrorMessage(createError);
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建页面</DialogTitle>
          <DialogDescription>
            选择主题声明的页面类型，创建后会立即打开。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(88vh-9rem)] space-y-5 overflow-y-auto pr-1">
          {pageTypes.length === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              当前主题没有声明 pageTypes，无法新建页面。
            </div>
          ) : (
            <section className="space-y-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                页面类型
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {pageTypes.map((pageType) => {
                  const target = collectionFor(pageType);
                  const available = collections.has(target);
                  const active = pageType.id === selectedId;

                  return (
                    <button
                      key={pageType.id}
                      type="button"
                      disabled={!available}
                      onClick={() => setSelectedId(pageType.id)}
                      className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? 'border-primary bg-muted/60'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {pageType.label}
                        </span>
                        <Badge variant="outline">
                          {pageType.id}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {pageType.route} · {pageType.layout}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        collection: {target}
                        {!available &&
                          '（不存在，无法创建）'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {selected && (
            <section className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  collection: {collection}
                </Badge>
                <Badge variant="secondary">
                  layout: {selected.layout}
                </Badge>
                <Badge variant="secondary">
                  {routeFor(selected, slug)}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                字段：
                {selected.fields.length === 0
                  ? '无'
                  : selected.fields
                      .map(
                        (field) =>
                          `${field.label} (${field.key})`,
                      )
                      .join('、')}
              </div>
              {!collectionExists && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  collection “{collection}” 不存在，请先在
                  content 下创建该目录。
                </div>
              )}
            </section>
          )}

          <section className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="create-title">
                标题
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-title"
                value={title}
                disabled={creating || pageTypes.length === 0}
                placeholder="页面标题"
                aria-invalid={titleError !== undefined}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
              />
              {titleError && (
                <p className="text-xs text-destructive">
                  {titleError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-slug">
                Slug
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-slug"
                value={slug}
                disabled={creating || pageTypes.length === 0}
                placeholder="page-slug"
                aria-invalid={
                  slugError !== undefined ||
                  conflict !== undefined
                }
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
              />
              {slugError ? (
                <p className="text-xs text-destructive">
                  {slugError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  默认根据标题生成，可手动修改。
                </p>
              )}
            </div>

            {conflict && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {conflict}
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
          >
            {creating && <Loader2 className="animate-spin" />}
            创建并打开
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
