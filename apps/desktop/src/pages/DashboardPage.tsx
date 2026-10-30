import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "../context/SiteContext";
import { createArticle, type Article } from "../lib/article";
import { countWordsHtml, fmtDate } from "../lib/words";
import { EmptyState } from "../components/common/empty-state";
import {
  ListCard,
  ListRow,
  ListRowMain,
  ListRowMeta,
  ListRowSide,
  ListRowTitle,
} from "../components/common/list-row";
import { PageView } from "../components/common/page-view";
import { StatusBadge } from "../components/common/status-badge";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** 对应设计稿 .stat-card */
function StatCard({ num, cap }: { num: string; cap: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-[18px] py-4 shadow-card">
      <span className="block text-[26px] leading-[1.2] font-bold text-foreground tabular-nums">
        {num}
      </span>
      <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
        {cap}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { activeSite, articles, reloadArticles } = useSite();
  const [, navigate] = useLocation();
  const [creating, setCreating] = useState(false);

  const published = articles.filter((a) => a.status === "published").length;
  const drafts = articles.length - published;
  const totalWords = articles.reduce((n, a) => n + countWordsHtml(a.content), 0);

  const recent = useMemo(
    () =>
      articles
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5),
    [articles],
  );

  const handleCreate = async () => {
    setCreating(true);
    try {
      const article = await createArticle(activeSite.id, "");
      reloadArticles();
      navigate(`/editor/${article.id}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageView>
      {/* 问候区 */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold text-foreground">
            {greeting()}，写作者
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            「{activeSite.name}」
            {articles.length
              ? "一切井然有序，继续写吧。"
              : "还是一片空白，从第一篇开始。"}
          </p>
        </div>
        <Button disabled={creating} onClick={handleCreate}>
          {creating ? (
            <Spinner className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          写一篇文章
        </Button>
      </div>

      {/* 统计卡 */}
      <div className="mb-7 grid grid-cols-4 gap-3.5">
        <StatCard num={String(articles.length)} cap="文章总数" />
        <StatCard num={String(published)} cap="已发布" />
        <StatCard num={String(drafts)} cap="草稿箱" />
        <StatCard num={totalWords.toLocaleString("zh-CN")} cap="总字数" />
      </div>

      {/* 最近编辑 */}
      {recent.length === 0 ? (
        <ListCard>
          <EmptyState
            icon={FileText}
            title="还没有文章"
            description="写下第一篇，从这个站点开始积累。"
            action={
              <Button disabled={creating} onClick={handleCreate}>
                {creating ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                写一篇文章
              </Button>
            }
          />
        </ListCard>
      ) : (
        <ListCard>
          <div className="flex items-center border-b border-border px-[18px] py-3.5 text-sm font-semibold text-foreground">
            最近编辑
          </div>
          {recent.map((a: Article, i) => (
            <ListRow
              key={a.id}
              showBorder={i < recent.length - 1}
              onClick={() => navigate(`/editor/${a.id}`)}
            >
              <ListRowMain>
                <ListRowTitle>{a.title || "（无标题）"}</ListRowTitle>
                <ListRowMeta>
                  {a.categories.map((c) => c.name).join("、") || null}
                  {a.categories.length > 0 && a.tags.length > 0 ? " · " : ""}
                  {a.tags.map((t) => t.name).join("、") || null}
                  {a.categories.length + a.tags.length > 0 ? " · " : ""}
                  {fmtDate(a.updatedAt)} · 约 {countWordsHtml(a.content)} 字
                </ListRowMeta>
              </ListRowMain>
              <ListRowSide>
                <StatusBadge published={a.status === "published"} />
              </ListRowSide>
            </ListRow>
          ))}
        </ListCard>
      )}
    </PageView>
  );
}
