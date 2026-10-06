import { useMemo, useState } from "react";
import { App as AntdApp, Button, Empty, Tag } from "antd";
import { Plus } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useLocation } from "wouter";
import { useSite } from "../context/SiteContext";
import { createArticle, type Article } from "../lib/article";
import { countWords, fmtDate } from "../lib/words";
import { pageStyles } from "../styles/page.stylex";

const styles = stylex.create({
  hello: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  helloTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: "var(--ant-color-text)",
  },
  helloSub: {
    margin: "4px 0 0",
    fontSize: 13.5,
    color: "var(--ant-color-text-tertiary)",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
    marginBottom: 28,
  },
  statCard: {
    backgroundColor: "var(--ant-color-bg-container)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 10,
    padding: "16px 18px",
  },
  statNum: {
    display: "block",
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "var(--ant-color-text)",
    fontVariantNumeric: "tabular-nums",
  },
  statCap: {
    display: "block",
    fontSize: 12.5,
    marginTop: 2,
    color: "var(--ant-color-text-tertiary)",
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    padding: "14px 18px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--ant-color-text)",
  },
});

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
    <div {...stylex.props(styles.statCard)}>
      <span {...stylex.props(styles.statNum)}>{num}</span>
      <span {...stylex.props(styles.statCap)}>{cap}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { message } = AntdApp.useApp();
  const { activeSite, articles, reloadArticles } = useSite();
  const [, navigate] = useLocation();
  const [creating, setCreating] = useState(false);

  const published = articles.filter((a) => a.status === "published").length;
  const drafts = articles.length - published;
  const totalWords = articles.reduce((n, a) => n + countWords(a.content), 0);

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
      message.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      {/* 问候区 */}
      <div {...stylex.props(styles.hello)}>
        <div>
          <h1 {...stylex.props(styles.helloTitle)}>
            {greeting()}，写作者
          </h1>
          <p {...stylex.props(styles.helloSub)}>
            「{activeSite.name}」
            {articles.length
              ? "一切井然有序，继续写吧。"
              : "还是一片空白，从第一篇开始。"}
          </p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={14} />}
          loading={creating}
          onClick={handleCreate}
        >
          写一篇文章
        </Button>
      </div>

      {/* 统计卡 */}
      <div {...stylex.props(styles.statGrid)}>
        <StatCard num={String(articles.length)} cap="文章总数" />
        <StatCard num={String(published)} cap="已发布" />
        <StatCard num={String(drafts)} cap="草稿箱" />
        <StatCard num={totalWords.toLocaleString("zh-CN")} cap="总字数" />
      </div>

      {/* 最近编辑 */}
      {recent.length === 0 ? (
        <div {...stylex.props(pageStyles.card, pageStyles.emptyBox)}>
          <Empty description="还没有文章，写下第一篇，从这个站点开始积累。">
            <Button
              type="primary"
              icon={<Plus size={14} />}
              onClick={handleCreate}
            >
              写一篇文章
            </Button>
          </Empty>
        </div>
      ) : (
        <div {...stylex.props(pageStyles.card)}>
          <div {...stylex.props(styles.cardHead)}>最近编辑</div>
          {recent.map((a: Article, i) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/editor/${a.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/editor/${a.id}`);
              }}
              {...stylex.props(
                pageStyles.row,
                i < recent.length - 1 && pageStyles.rowBorder,
              )}
            >
              <div {...stylex.props(pageStyles.rowMain)}>
                <span {...stylex.props(pageStyles.rowTitle)}>
                  {a.title || "（无标题）"}
                </span>
                <span {...stylex.props(pageStyles.rowMeta)}>
                  {a.categories.map((c) => c.name).join("、") || null}
                  {a.categories.length > 0 && a.tags.length > 0 ? " · " : ""}
                  {a.tags.map((t) => t.name).join("、") || null}
                  {a.categories.length + a.tags.length > 0 ? " · " : ""}
                  {fmtDate(a.updatedAt)} · 约 {countWords(a.content)} 字
                </span>
              </div>
              <div {...stylex.props(pageStyles.rowSide)}>
                <Tag
                  variant="filled"
                  color={a.status === "published" ? "success" : undefined}
                >
                  {a.status === "published" ? "已发布" : "草稿"}
                </Tag>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
