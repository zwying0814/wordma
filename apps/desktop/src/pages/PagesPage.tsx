import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FileStack, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useLocation } from "wouter";
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
import { createPage, deletePage, type SitePage } from "../lib/pages";
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

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const pageSchema = z.object({
  title: z.string().refine((value) => value.trim().length > 0, "请输入页面标题"),
  slug: z
    .string()
    .min(1, "请输入 slug")
    .regex(SLUG_RE, "slug 只能包含小写字母、数字和中划线"),
});

type PageFormValues = z.infer<typeof pageSchema>;

function PageRow({
  page,
  showBorder,
  onDelete,
}: {
  page: SitePage;
  showBorder: boolean;
  onDelete: (page: SitePage) => void;
}) {
  const [, navigate] = useLocation();
  return (
    <ListRow
      showBorder={showBorder}
      onClick={(e) => {
        // 点击行内按钮（编辑/删除）不触发整行跳转
        if ((e.target as HTMLElement).closest("button")) return;
        navigate(`/pages/edit/${page.id}`);
      }}
    >
      <ListRowMain>
        <ListRowTitle>{page.title || "（未命名页面）"}</ListRowTitle>
        <ListRowMeta>
          /{page.slug} · {page.showInNav ? "显示在导航" : "不在导航中"}
        </ListRowMeta>
      </ListRowMain>
      <ListRowSide>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`编辑页面「${page.title}」`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/pages/edit/${page.id}`);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
          aria-label={`删除页面「${page.title}」`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(page);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </ListRowSide>
    </ListRow>
  );
}

export default function PagesPage() {
  const { activeSite, pages, pagesLoading, reloadPages } = useSite();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SitePage | null>(null);
  const form = useForm<PageFormValues>({
    resolver: zodResolver(pageSchema),
    defaultValues: { title: "", slug: "" },
  });
  const { isSubmitting } = form.formState;

  const openCreate = () => {
    // 预填一个可用 slug，用户可改
    form.reset({ title: "", slug: `page-${pages.length + 1}` });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const page = await createPage(
        activeSite.id,
        values.title.trim(),
        values.slug.trim().toLowerCase(),
      );
      reloadPages();
      setDialogOpen(false);
      navigate(`/pages/edit/${page.id}`);
    } catch (e) {
      toast.error(String(e));
    }
  });

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deletePage(pendingDelete.id);
      reloadPages();
      toast.success("页面已删除");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <PageView>
      <PageHeader
        title="页面"
        subtitle={`共 ${pages.length} 个 · 独立页面会出现在站点导航中`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-3.5" />
            新建页面
          </Button>
        }
      />

      {pagesLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <ListCard>
          <EmptyState
            icon={FileStack}
            title="还没有页面"
            description="独立页面适合放置「关于」「友链」等内容。"
            action={
              <Button onClick={openCreate}>
                <Plus className="size-3.5" />
                新建页面
              </Button>
            }
          />
        </ListCard>
      ) : (
        <ListCard>
          {pages.map((p, i) => (
            <PageRow
              key={p.id}
              page={p}
              showBorder={i < pages.length - 1}
              onDelete={setPendingDelete}
            />
          ))}
        </ListCard>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next && !isSubmitting) setDialogOpen(false);
        }}
      >
        <DialogContent showCloseButton={!isSubmitting} className="sm:max-w-md">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>新建页面</DialogTitle>
              <DialogDescription>
                创建后会立即进入页面编辑器。
              </DialogDescription>
            </DialogHeader>
            <Field
              label="页面标题"
              htmlFor="page-title"
              error={form.formState.errors.title?.message}
            >
              <Input
                id="page-title"
                placeholder="例如：关于我"
                aria-invalid={Boolean(form.formState.errors.title)}
                {...form.register("title")}
              />
            </Field>
            <Field
              label="slug（生成访问路径 /slug）"
              htmlFor="page-slug"
              error={form.formState.errors.slug?.message}
            >
              <Input
                id="page-slug"
                placeholder="例如：about"
                spellCheck={false}
                aria-invalid={Boolean(form.formState.errors.slug)}
                {...form.register("slug")}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Spinner className="size-4" /> : null}
                创建并编辑
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除页面"
        description="删除后无法恢复，确定删除？"
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
