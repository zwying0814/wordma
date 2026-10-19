import * as React from 'react';

import { FolderOpen, Plus, Puzzle, Trash2 } from 'lucide-react';

import { useSite } from '@/context/SiteContext';
import {
  deleteComponent,
  getComponent,
  listComponents,
  openComponentsDir,
  saveComponent,
} from '@/lib/mdx';
import { errorMessage } from '@/lib/errors';
import type { ComponentMeta } from '@/types/api';
import { IslandMount } from '@/components/island-mount';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardList, CardTitle } from '@/components/ui/card';
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
import { useToast } from '@/lib/use-toast';
import { cn } from '@/lib/utils';

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

const TEMPLATE = `import { useState } from 'react';

/** 组件默认导出即可；props 来自文章里的 MDX 块 */
export default function Counter({ start = 0 }: { start?: number }) {
  const [count, setCount] = useState(start);

  return (
    <button
      onClick={() => setCount(count + 1)}
      style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}
    >
      计数 {count}
    </button>
  );
}
`;

/** 组件页：/components —— 站点 components/*.tsx 的列表、编辑与实时预览 */
export function ComponentsPage() {
  const { activeSite } = useSite();
  const { toast } = useToast();

  const [items, setItems] = React.useState<ComponentMeta[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<ComponentMeta | null>(
    null
  );

  const reload = React.useCallback(async () => {
    const list = await listComponents();
    setItems(list);
    return list;
  }, []);

  React.useEffect(() => {
    setError(null);
    void reload().catch((err) => setError(errorMessage(err)));
  }, [reload, activeSite?.id]);

  const open = React.useCallback(
    async (name: string) => {
      setError(null);
      try {
        const loaded = await getComponent(name);
        setSelected(name);
        setCode(loaded.code);
        setDirty(false);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    []
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!NAME_RE.test(name)) {
      setError('组件名只能用小写字母、数字与连字符，且以字母或数字开头');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveComponent(name, TEMPLATE);
      await reload();
      await open(name);
      setCreating(false);
      setNewName('');
      toast(`组件「${name}」已创建`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await saveComponent(selected, code);
      await reload();
      setDirty(false);
      toast(`组件「${selected}」已保存`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteComponent(pendingDelete.name);
      if (selected === pendingDelete.name) {
        setSelected(null);
        setCode('');
      }
      toast(`组件「${pendingDelete.name}」已删除`);
      setPendingDelete(null);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-9" data-testid="components-page">
      <PageHeader
        actions={
          <>
            <Button onClick={() => void openComponentsDir()} variant="outline">
              <FolderOpen className="size-4" />
              打开目录
            </Button>
            <Button
              data-testid="component-new"
              onClick={() => {
                setNewName('');
                setCreating(true);
              }}
            >
              <Plus className="size-4" />
              新建组件
            </Button>
          </>
        }
        subtitle={`共 ${items.length} 个 · 放在站点目录 components/ 下，文章里用 MDX 块引用`}
        title="组件"
      />

      {error && (
        <p className="mb-3 text-destructive text-sm" data-testid="components-error">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-5">
        {/* 列表 */}
        <Card className="flex w-64 shrink-0 flex-col">
          <CardHeader>
            <CardTitle>全部组件</CardTitle>
          </CardHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                description="用 tsx 写交互式内容，文章里引用即可渲染。"
                icon={Puzzle}
                title="还没有组件"
              />
            ) : (
              <CardList>
                {items.map((item) => (
                  <ListRow
                    actions={
                      <Button
                        aria-label={`删除 ${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDelete(item);
                        }}
                        size="icon-sm"
                        variant="destructiveGhost"
                      >
                        <Trash2 />
                      </Button>
                    }
                    className={cn(
                      selected === item.name && 'bg-sidebar-accent/60'
                    )}
                    data-testid={`component-item-${item.name}`}
                    key={item.name}
                    meta={`${(item.bytes / 1024).toFixed(1)} KB`}
                    onClick={() => void open(item.name)}
                    title={item.name}
                  />
                ))}
              </CardList>
            )}
          </div>
        </Card>

        {/* 编辑区 */}
        <Card className="flex min-w-0 flex-1 flex-col">
          <CardHeader>
            <CardTitle>
              {selected ? `${selected}.tsx` : '选择一个组件开始编辑'}
            </CardTitle>
            {dirty && (
              <span className="ml-auto text-muted-foreground text-xs">未保存</span>
            )}
            {selected && (
              <Button
                className={dirty ? '' : 'ml-auto'}
                data-testid="component-save"
                disabled={busy || !dirty}
                onClick={() => void handleSave()}
                size="sm"
              >
                {busy ? '保存中…' : '保存'}
              </Button>
            )}
          </CardHeader>

          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <textarea
                className="min-h-0 flex-1 resize-none border-b border-border bg-card p-4 font-mono text-xs leading-relaxed outline-none"
                data-testid="component-code"
                onChange={(event) => {
                  setCode(event.target.value);
                  setDirty(true);
                }}
                onKeyDown={(event) => {
                  // Tab 缩进（写代码时不该跳走焦点）
                  if (event.key !== 'Tab') return;
                  event.preventDefault();
                  const el = event.currentTarget;
                  const { selectionStart: start, selectionEnd: end } = el;
                  const next = `${code.slice(0, start)}  ${code.slice(end)}`;
                  setCode(next);
                  setDirty(true);
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }}
                spellCheck={false}
                value={code}
              />

              <div className="border-b border-border px-4 py-2">
                <span className="font-semibold text-muted-foreground text-xs">
                  预览（props 用 {'{}'}）
                </span>
              </div>
              <div className="max-h-72 min-h-24 overflow-auto p-4">
                {dirty ? (
                  <p className="text-muted-foreground text-xs">
                    保存后预览会更新为最新代码
                  </p>
                ) : (
                  <IslandMount name={selected} props={{}} />
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              description="左侧选一个组件，或新建一个：默认导出 React 组件即可，可以 import react、同目录文件与已安装的 npm 包。"
              icon={Puzzle}
              title="未选择组件"
            />
          )}
        </Card>
      </div>

      {/* 新建 */}
      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent className="max-w-[400px] sm:max-w-[400px]">
          <DialogTitle>新建组件</DialogTitle>
          <DialogDescription>
            文件名即组件名（小写字母、数字、连字符），创建后会写入站点目录的
            components/。
          </DialogDescription>
          <Input
            data-testid="component-name-input"
            maxLength={64}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate();
            }}
            placeholder="例如：counter"
            value={newName}
          />
          <DialogFooter>
            <Button onClick={() => setCreating(false)} variant="outline">
              取消
            </Button>
            <Button
              data-testid="component-create"
              disabled={busy || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {busy ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog
        onOpenChange={(openState) => {
          if (!openState) setPendingDelete(null);
        }}
        open={pendingDelete !== null}
      >
        <DialogContent className="max-w-[420px] sm:max-w-[420px]">
          <DialogTitle>删除组件</DialogTitle>
          <DialogDescription>
            确认删除组件「{pendingDelete?.name}」？引用它的文章会显示占位提示，此操作不可撤销。
          </DialogDescription>
          <DialogFooter>
            <Button onClick={() => setPendingDelete(null)} variant="outline">
              取消
            </Button>
            <Button
              data-testid="component-delete-confirm"
              disabled={busy}
              onClick={() => void handleDelete()}
              variant="destructive"
            >
              {busy ? '删除中…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
