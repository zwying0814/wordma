import * as React from 'react';

import { Folder, PenLine, Plus, Tags, Trash2 } from 'lucide-react';

import { useSite } from '@/context/SiteContext';
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
import { Input } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { PageHeader } from '@/components/ui/page-header';
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  listCategories,
  listTags,
  renameCategory,
  renameTag,
} from '@/lib/taxonomy';
import { errorMessage } from '@/lib/errors';

export type TaxonomyKind = 'tag' | 'category';

export type TaxonomyItem = { id: number; name: string; articleCount: number };

const NAME_MAX = 20;

const COPY = {
  tag: {
    title: '标签',
    label: '标签',
    icon: Tags,
    testId: 'tag',
    pageTestId: 'tags-page',
    newLabel: '新建标签',
    emptyTitle: '还没有标签',
    emptyDesc: '标签帮助读者按主题找到相关文章，一篇文章可以挂多个。',
    subtitle: (n: number) => `共 ${n} 个 · 一篇文章可挂多个标签`,
  },
  category: {
    title: '分类',
    label: '分类',
    icon: Folder,
    testId: 'category',
    pageTestId: 'categories-page',
    newLabel: '新建分类',
    emptyTitle: '还没有分类',
    emptyDesc: '分类是文章的一级归属，一篇文章可以属于多个分类。',
    subtitle: (n: number) => `共 ${n} 个 · 文章的一级归属`,
  },
} as const;

/**
 * 标签 / 分类管理页（design 的 tags / categories 页）：
 * 页头「新建」按钮开弹窗创建，行内重命名与删除。
 */
export function TaxonomyManager({ kind }: { kind: TaxonomyKind }) {
  const copy = COPY[kind];
  const { activeSite, reload: reloadNav } = useSite();
  const siteId = activeSite?.id ?? null;

  const [items, setItems] = React.useState<TaxonomyItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createBusy, setCreateBusy] = React.useState(false);

  const [renaming, setRenaming] = React.useState<TaxonomyItem | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [renameBusy, setRenameBusy] = React.useState(false);

  const [pendingDelete, setPendingDelete] = React.useState<TaxonomyItem | null>(
    null
  );
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (siteId === null) {
      setItems([]);
      return;
    }
    const list = kind === 'tag' ? await listTags(siteId) : await listCategories(siteId);
    setItems(list);
  }, [kind, siteId]);

  React.useEffect(() => {
    setError(null);
    void reload().catch((err) => setError(errorMessage(err)));
  }, [reload]);

  const handleCreate = async () => {
    if (siteId === null) return;
    const name = newName.trim();
    if (!name) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      if (kind === 'tag') await createTag({ siteId, name });
      else await createCategory({ siteId, name });
      await reload();
      await reloadNav();
      setCreating(false);
      setNewName('');
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const name = renameValue.trim();
      if (kind === 'tag') await renameTag({ id: renaming.id, name });
      else await renameCategory({ id: renaming.id, name });
      await reload();
      setRenaming(null);
    } catch (err) {
      setRenameError(errorMessage(err));
    } finally {
      setRenameBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      if (kind === 'tag') await deleteTag(pendingDelete.id);
      else await deleteCategory(pendingDelete.id);
      await reload();
      await reloadNav();
      setPendingDelete(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  const Icon = copy.icon;

  return (
    <div className="flex flex-col p-9" data-testid={copy.pageTestId}>
      <PageHeader
        actions={
          <Button
            data-testid={`${copy.testId}-new`}
            onClick={() => {
              setNewName('');
              setCreateError(null);
              setCreating(true);
            }}
          >
            <Plus className="size-4" />
            {copy.newLabel}
          </Button>
        }
        subtitle={copy.subtitle(items.length)}
        title={copy.title}
      />

      {error && (
        <p className="mb-3 text-destructive text-sm" data-testid={`${copy.testId}-error`}>
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState description={copy.emptyDesc} icon={Icon} title={copy.emptyTitle}>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {copy.newLabel}
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <CardList>
            {items.map((item) => (
              <ListRow
                actions={
                  <>
                    <Chip variant="secondary">{item.articleCount} 篇</Chip>
                    <Button
                      aria-label={`重命名 ${item.name}`}
                      onClick={() => {
                        setRenameError(null);
                        setRenameValue(item.name);
                        setRenaming(item);
                      }}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <PenLine />
                    </Button>
                    <Button
                      aria-label={`删除 ${item.name}`}
                      onClick={() => setPendingDelete(item)}
                      size="icon-sm"
                      variant="destructiveGhost"
                    >
                      <Trash2 />
                    </Button>
                  </>
                }
                data-testid={`${copy.testId}-item-${item.name}`}
                key={item.id}
                meta={`${item.articleCount} 篇文章`}
                title={item.name}
              />
            ))}
          </CardList>
        </Card>
      )}

      {/* 新建 */}
      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent className="max-w-[400px] sm:max-w-[400px]">
          <DialogTitle>{copy.newLabel}</DialogTitle>
          <DialogDescription>
            {kind === 'tag'
              ? '给文章一个可复现的主题关键词。'
              : '分类是文章的一级归属，便于读者按栏目浏览。'}
          </DialogDescription>
          <Input
            data-testid={`${copy.testId}-name-input`}
            maxLength={NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder={`名称（≤${NAME_MAX} 字）`}
            value={newName}
          />
          {createError && (
            <p className="text-destructive text-sm" data-testid={`${copy.testId}-create-error`}>
              {createError}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setCreating(false)} variant="outline">
              取消
            </Button>
            <Button
              data-testid={`${copy.testId}-create`}
              disabled={createBusy || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {createBusy ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名 */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        open={renaming !== null}
      >
        <DialogContent className="max-w-[400px] sm:max-w-[400px]">
          <DialogTitle>重命名{copy.label}</DialogTitle>
          <DialogDescription>
            将「{renaming?.name}」重命名为新名称，修改会同步到使用它的文章。
          </DialogDescription>
          <Input
            data-testid={`${copy.testId}-rename-input`}
            maxLength={NAME_MAX}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename();
            }}
            value={renameValue}
          />
          {renameError && (
            <p
              className="text-destructive text-sm"
              data-testid={`${copy.testId}-rename-error`}
            >
              {renameError}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setRenaming(null)} variant="outline">
              取消
            </Button>
            <Button
              data-testid={`${copy.testId}-rename-confirm`}
              disabled={renameBusy || !renameValue.trim()}
              onClick={() => void handleRename()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <DialogContent className="max-w-[420px] sm:max-w-[420px]">
          <DialogTitle>删除{copy.label}</DialogTitle>
          <DialogDescription>
            {kind === 'tag'
              ? `标签「${pendingDelete?.name}」正被 ${pendingDelete?.articleCount ?? 0} 篇文章使用，删除后将从这些文章中移除。`
              : `分类「${pendingDelete?.name}」下有 ${pendingDelete?.articleCount ?? 0} 篇文章，删除后这些文章将解除该分类。`}
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(null)} variant="outline">
              取消
            </Button>
            <Button
              data-testid={`${copy.testId}-delete-confirm`}
              disabled={deleteBusy}
              onClick={() => void handleDelete()}
              variant="destructive"
            >
              {deleteBusy ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
