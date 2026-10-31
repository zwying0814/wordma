import { useMemo, useState } from "react";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "../context/SiteContext";
import {
  createArticle,
  deleteArticle,
  type Article,
  type ArticleStatus,
} from "../lib/article";
import { fmtDate } from "../lib/words";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { EmptyState } from "../components/common/empty-state";
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
import { Segmented } from "../components/common/segmented";
import { StatusBadge } from "../components/common/status-badge";

function ArticleRow({
  article,
  showBorder,
  onDelete,
}: {
  article: Article;
  showBorder: boolean;
  onDelete: (article: Article) => void;
}) {
  const [, navigate] = useLocation();
  const published = article.status === "published";
  // 与设计稿 articleMeta 一致：分类 · 标签 · 日期 · 字数
  const meta = [
    article.categories.map((c) => c.name).join("、") || null,
    article.tags.map((t) => t.name).join("、") || null,
    fmtDate(article.updatedAt),
    `约 ${article.wordCount} 字`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListRow
      showBorder={showBorder}
      onClick={(e) => {
        // 点击行内按钮（删除/气泡）不触发整行跳转，与设计稿 row.onclick 守卫一致
        if ((e.target as HTMLElement).closest("button")) return;
        navigate(`/editor/${article.id}`);
      }}
    >
      <ListRowMain>
        <ListRowTitle>{article.title || "（无标题）"}</ListRowTitle>
        <ListRowMeta>{meta}</ListRowMeta>
      </ListRowMain>
      <ListRowSide>
        <StatusBadge published={published} />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
          aria-label={`删除「${article.title || "无标题"}」`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(article);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </ListRowSide>
    </ListRow>
  );
}

export default function ArticlesPage() {
  const { activeSite, articles, articlesLoading, reloadArticles } = useSite();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | ArticleStatus>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Article | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [articles, statusFilter, query]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      // 与设计稿一致：先建空文章直接进编辑器
      const article = await createArticle(activeSite.id, "");
      reloadArticles();
      navigate(`/editor/${article.id}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteArticle(pendingDelete.id);
      reloadArticles();
      toast.success("文章已删除");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <PageView>
      <PageHeader
        title="文章"
        subtitle={`共 ${articles.length} 篇 · ${activeSite.name}`}
        actions={
          <Button disabled={creating} onClick={handleCreate}>
            {creating ? (
              <Spinner className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            新建文章
          </Button>
        }
      />

      <div className="mb-3.5 flex items-center gap-3">
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: "全部", value: "all" },
            { label: "已发布", value: "published" },
            { label: "草稿", value: "draft" },
          ]}
        />
        <div className="relative ml-auto w-[220px] max-w-[44%]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索标题…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索标题"
          />
        </div>
      </div>

      {articlesLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <ListCard>
          <EmptyState
            icon={FileText}
            title={articles.length === 0 ? "还没有文章" : "没有匹配的文章"}
            description={
              articles.length === 0
                ? "第一篇文章往往最难，也最重要。"
                : "换个关键词试试。"
            }
            action={
              articles.length === 0 ? (
                <Button disabled={creating} onClick={handleCreate}>
                  {creating ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  写一篇文章
                </Button>
              ) : null
            }
          />
        </ListCard>
      ) : (
        <ListCard>
          {filtered.map((a, i) => (
            <ArticleRow
              key={a.id}
              article={a}
              showBorder={i < filtered.length - 1}
              onDelete={setPendingDelete}
            />
          ))}
        </ListCard>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除文章"
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
