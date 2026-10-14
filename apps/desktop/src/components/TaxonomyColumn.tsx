import * as React from 'react';

import { PenLine, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type TaxonomyItem = { id: number; name: string; articleCount: number };

const NAME_MAX = 20;

/** 分类/标签管理栏：新建 + 列表（计数）+ 重命名/删除弹窗 */
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
    <section className="flex min-w-0 flex-1 flex-col" data-testid={`${testId}-column`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary">{items.length}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input
          className="h-8 flex-1"
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
          className="h-8"
          data-testid={`${testId}-create`}
          disabled={!newName.trim() || creating}
          onClick={() => void handleCreate()}
          size="sm"
        >
          <Plus className="size-4" />
          新建
        </Button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto rounded-lg border">
        {items.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            暂无{kindLabel}
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li
                className="flex items-center justify-between gap-2 px-3 py-2"
                data-testid={`${testId}-item-${item.name}`}
                key={item.id}
              >
                <span className="truncate">{item.name}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{item.articleCount} 篇</Badge>
                  <Button
                    aria-label={`重命名 ${item.name}`}
                    onClick={() => openRename(item)}
                    size="icon"
                    variant="ghost"
                  >
                    <PenLine className="size-3.5" />
                  </Button>
                  <Button
                    aria-label={`删除 ${item.name}`}
                    onClick={() => setPendingDelete(item)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

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
            将「{renaming?.name}」重命名为新名称。
          </DialogDescription>
          <Input
            data-testid={`${testId}-rename-input`}
            maxLength={NAME_MAX}
            onChange={(e) => setRenameValue(e.target.value)}
            value={renameValue}
          />
          {renameError && (
            <p className="text-destructive text-sm" data-testid={`${testId}-rename-error`}>
              {renameError}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setRenaming(null)} variant="ghost">
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
            <Button onClick={() => setPendingDelete(null)} variant="ghost">
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
