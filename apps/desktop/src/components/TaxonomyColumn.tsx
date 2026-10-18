import * as React from 'react';

import { PenLine, Plus, Tags, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardList, CardHeader, CardTitle } from '@/components/ui/card';
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

export type TaxonomyItem = { id: number; name: string; articleCount: number };

const NAME_MAX = 20;

/** 分类/标签管理栏（design 的卡片 + 行列表）：新建 + 列表（计数）+ 重命名/删除弹窗 */
export function TaxonomyColumn({
  title,
  kindLabel,
  items,
  testId,
  onCreate,
  onRename,
  onDelete,
}: {
  title: string;
  /** '标签' | '分类'，用于错误文案 */
  kindLabel: string;
  items: TaxonomyItem[];
  testId: string;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [newName, setNewName] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const [renaming, setRenaming] = React.useState<TaxonomyItem | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [renamingBusy, setRenamingBusy] = React.useState(false);

  const [pendingDelete, setPendingDelete] = React.useState<TaxonomyItem | null>(
    null
  );
  const [deleting, setDeleting] = React.useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate(name);
      setNewName('');
    } finally {
      setCreating(false);
    }
  };

  const openRename = (item: TaxonomyItem) => {
    setRenameError(null);
    setRenameValue(item.name);
    setRenaming(item);
  };

  const handleRename = async () => {
    if (!renaming) return;
    setRenamingBusy(true);
    setRenameError(null);
    try {
      await onRename(renaming.id, renameValue.trim());
      setRenaming(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamingBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      className="flex min-w-0 flex-1 flex-col"
      data-testid={`${testId}-column`}
    >
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <Chip className="ml-auto" variant="outline">
            {items.length}
          </Chip>
        </CardHeader>

        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <Input
            data-testid={`${testId}-name-input`}
            maxLength={NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder={`新建${kindLabel}（≤${NAME_MAX} 字）`}
            value={newName}
          />
          <Button
            data-testid={`${testId}-create`}
            disabled={!newName.trim() || creating}
            onClick={() => void handleCreate()}
          >
            <Plus className="size-4" />
            新建
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState
              description={`${kindLabel}帮助读者按主题找到相关文章。`}
              icon={Tags}
              title={`还没有${kindLabel}`}
            />
          ) : (
            <CardList>
              {items.map((item) => (
                <ListRow
                  actions={
                    <>
                      <Chip variant="secondary">{item.articleCount} 篇</Chip>
                      <Button
                        aria-label={`重命名 ${item.name}`}
                        onClick={() => openRename(item)}
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
                  data-testid={`${testId}-item-${item.name}`}
                  key={item.id}
                  meta={`${item.articleCount} 篇文章`}
                  title={item.name}
                />
              ))}
            </CardList>
          )}
        </div>
      </Card>

      {/* 重命名弹窗 */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        open={renaming !== null}
      >
        <DialogContent className="max-w-[400px]">
          <DialogTitle>重命名{kindLabel}</DialogTitle>
          <DialogDescription>
            将「{renaming?.name}」重命名为新名称，修改会同步到使用它的文章。
          </DialogDescription>
          <Input
            data-testid={`${testId}-rename-input`}
            maxLength={NAME_MAX}
            onChange={(e) => setRenameValue(e.target.value)}
            value={renameValue}
          />
          {renameError && (
            <p
              className="text-destructive text-sm"
              data-testid={`${testId}-rename-error`}
            >
              {renameError}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setRenaming(null)} variant="outline">
              取消
            </Button>
            <Button
              data-testid={`${testId}-rename-confirm`}
              disabled={renamingBusy || !renameValue.trim()}
              onClick={() => void handleRename()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <DialogContent className="max-w-[420px]">
          <DialogTitle>删除{kindLabel}</DialogTitle>
          <DialogDescription>
            确认删除{kindLabel}「{pendingDelete?.name}」？已关联文章将解除关联。
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(null)} variant="outline">
              取消
            </Button>
            <Button
              data-testid={`${testId}-delete-confirm`}
              disabled={deleting}
              onClick={() => void handleDelete()}
              variant="destructive"
            >
              {deleting ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
