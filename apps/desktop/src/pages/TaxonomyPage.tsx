import { useState } from "react";
import { Folder, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "../context/SiteContext";
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  renameCategory,
  renameTag,
} from "../lib/taxonomy";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { EmptyState } from "../components/common/empty-state";
import { Field } from "../components/common/field";
import {
  ListCard,
  ListRow,
  ListRowMain,
  ListRowMeta,
  ListRowSide,
  ListRowTitle,
} from "../components/common/list-row";
import { PageHeader } from "../components/common/page-header";
import { PageView } from "../components/common/page-view";

export type TaxonomyKind = "tag" | "category";

const NAME_MAX = 20;

interface Row {
  id: number;
  name: string;
  articleCount: number;
}

export function TagsPage() {
  return <TaxonomyPage kind="tag" />;
}

export function CategoriesPage() {
  return <TaxonomyPage kind="category" />;
}

/** 标签页与分类页共用：列表 + 新建/重命名弹窗 + 删除确认（布局对应设计稿 .card/.rowitem） */
function TaxonomyPage({ kind }: { kind: TaxonomyKind }) {
  const {
    activeSite,
    tags,
    categories,
    taxonomyLoading,
    reloadTaxonomy,
    reloadArticles,
  } = useSite();
  const isTag = kind === "tag";
  const noun = isTag ? "标签" : "分类";
  const list: Row[] = isTag ? tags : categories;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);

  const openCreate = () => {
    setName("");
    setNameError(null);
    setEditing(null);
    setDialogOpen(true);
  };

  const openRename = (row: Row) => {
    setName(row.name);
    setNameError(null);
    setEditing(row);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setNameError("名称不能为空");
      return;
    }
    if (value.length > NAME_MAX) {
      setNameError(`名称不能超过 ${NAME_MAX} 个字符`);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await (isTag ? renameTag(editing.id, value) : renameCategory(editing.id, value));
        toast.success(`${noun}已重命名`);
      } else {
        await (isTag
          ? createTag(activeSite.id, value)
          : createCategory(activeSite.id, value));
        toast.success(`${noun}已创建`);
      }
      setDialogOpen(false);
      // 重命名/删除会影响文章的分类名与计数
      reloadTaxonomy();
      reloadArticles();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await (isTag
        ? deleteTag(pendingDelete.id)
        : deleteCategory(pendingDelete.id));
      reloadTaxonomy();
      reloadArticles();
      toast.success(`${noun}已删除`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPendingDelete(null);
    }
  };

  const EmptyIcon = isTag ? Tags : Folder;

  return (
    <PageView>
      <PageHeader
        title={noun}
        subtitle={`共 ${list.length} 个`}
        actions={
          list.length > 0 ? (
            <Button onClick={openCreate}>
              <Plus className="size-3.5" />
              新建{noun}
            </Button>
          ) : null
        }
      />

      {taxonomyLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <ListCard>
          <EmptyState
            icon={EmptyIcon}
            title={`还没有${noun}`}
            description={
              isTag
                ? "标签帮助读者按主题找到相关文章。"
                : "分类是文章的一级归属，一篇文章只属于一个分类。"
            }
            action={
              <Button onClick={openCreate}>
                <Plus className="size-3.5" />
                新建{noun}
              </Button>
            }
          />
        </ListCard>
      ) : (
        <ListCard>
          {list.map((row, i) => (
            <ListRow key={row.id} showBorder={i < list.length - 1}>
              <ListRowMain>
                <ListRowTitle>{row.name}</ListRowTitle>
                <ListRowMeta>{row.articleCount} 篇文章</ListRowMeta>
              </ListRowMain>
              <ListRowSide>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`重命名${noun}「${row.name}」`}
                  onClick={() => openRename(row)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  aria-label={`删除${noun}「${row.name}」`}
                  onClick={() => setPendingDelete(row)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </ListRowSide>
            </ListRow>
          ))}
        </ListCard>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next && !saving) setDialogOpen(false);
        }}
      >
        <DialogContent showCloseButton={!saving} className="sm:max-w-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {editing ? `重命名${noun}` : `新建${noun}`}
              </DialogTitle>
              <DialogDescription>
                {isTag ? "标签用于横向组织文章。" : "分类是文章的一级归属。"}
              </DialogDescription>
            </DialogHeader>
            <Field
              label="名称"
              htmlFor="taxonomy-name"
              error={nameError}
            >
              <Input
                id="taxonomy-name"
                autoFocus
                value={name}
                placeholder={isTag ? "例如：旅行" : "例如：户外"}
                aria-invalid={Boolean(nameError)}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="size-4" /> : null}
                {editing ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`删除${noun}`}
        description="相关文章将解除关联，确定删除？"
        confirmLabel="删除"
        destructive
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </PageView>
  );
}
