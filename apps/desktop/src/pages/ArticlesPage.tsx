import { useMemo, useState } from "react";
import { App as AntdApp, Button, Empty, Input, Popconfirm, Segmented, Spin, Tag } from "antd";
import { Plus, Search, Trash2 } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useLocation } from "wouter";
import { useSite } from "../context/SiteContext";
import {
  createArticle,
  deleteArticle,
  type Article,
  type ArticleStatus,
} from "../lib/article";
import { countWords, fmtDate } from "../lib/words";
import { pageStyles } from "../styles/page.stylex";

function ArticleRow({
  article,
  showBorder,
  onDelete,
}: {
  article: Article;
  showBorder: boolean;
  onDelete: (id: number) => void;
}) {
  const [, navigate] = useLocation();
  const published = article.status === "published";
  // 与设计稿 articleMeta 一致：分类 · 标签 · 日期 · 字数
  const meta = [
    article.categories.map((c) => c.name).join("、") || null,
    article.tags.map((t) => t.name).join("、") || null,
    fmtDate(article.updatedAt),
    `约 ${countWords(article.content)} 字`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/editor/${article.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/editor/${article.id}`);
      }}
      {...stylex.props(
        pageStyles.row,
        pageStyles.rowClickable,
        showBorder && pageStyles.rowBorder,
      )}
    >
      <div {...stylex.props(pageStyles.rowMain)}>
        <span {...stylex.props(pageStyles.rowTitle)}>
          {article.title || "（无标题）"}
        </span>
        <span {...stylex.props(pageStyles.rowMeta)}>{meta}</span>
      </div>
      <div {...stylex.props(pageStyles.rowSide)}>
        <Tag variant="filled" color={published ? "success" : undefined}>
          {published ? "已发布" : "草稿"}
        </Tag>
        <Popconfirm
          title="删除文章"
          description="删除后无法恢复，确定删除？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => onDelete(article.id)}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<Trash2 size={14} />}
            aria-label={`删除「${article.title || "无标题"}」`}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      </div>
    </div>
  );
}

export default function ArticlesPage() {
  const { activeSite, articles, articlesLoading, reloadArticles } = useSite();
  const { message } = AntdApp.useApp();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | ArticleStatus>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

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
      message.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteArticle(id);
      reloadArticles();
      message.success("文章已删除");
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <div {...stylex.props(pageStyles.view)}>
      <div {...stylex.props(pageStyles.pageHead)}>
        <div>
          <div {...stylex.props(pageStyles.pageTitle)}>文章</div>
          <div {...stylex.props(pageStyles.pageSub)}>
            共 {articles.length} 篇 · {activeSite.name}
          </div>
        </div>
        <Button
          type="primary"
          icon={<Plus size={14} />}
          loading={creating}
          onClick={handleCreate}
        >
          新建文章
        </Button>
      </div>

      <div {...stylex.props(pageStyles.filterRow)}>
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "all" | ArticleStatus)}
          options={[
            { label: "全部", value: "all" },
            { label: "已发布", value: "published" },
            { label: "草稿", value: "draft" },
          ]}
        />
        <Input
          allowClear
          placeholder="搜索标题…"
          prefix={<Search size={14} />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          {...stylex.props(pageStyles.searchBox)}
        />
      </div>

      {articlesLoading ? (
        <div
          {...stylex.props(
            x.display.flex,
            x.justifyContent.center,
            x.padding._48px,
          )}
        >
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <div {...stylex.props(pageStyles.card, pageStyles.emptyBox)}>
          <Empty
            description={
              articles.length === 0
                ? "还没有文章，第一篇文章往往最难，也最重要。"
                : "没有匹配的文章，换个关键词试试。"
            }
          >
            {articles.length === 0 && (
              <Button type="primary" icon={<Plus size={14} />} onClick={handleCreate}>
                写一篇文章
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        <div {...stylex.props(pageStyles.card)}>
          {filtered.map((a, i) => (
            <ArticleRow
              key={a.id}
              article={a}
              showBorder={i < filtered.length - 1}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
