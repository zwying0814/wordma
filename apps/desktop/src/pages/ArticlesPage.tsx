import { useMemo, useState } from "react";
import { App as AntdApp, Button, Empty, Input, Popconfirm, Segmented, Spin, Tag } from "antd";
import { DeleteOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
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

// 布局对应设计稿 .view（滚动容器）+ .card/.rowitem（卡片行列表）
const styles = stylex.create({
  view: {
    height: "100%",
    overflowY: "auto",
    padding: "28px 36px 48px",
  },
  pageHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--ant-color-text)",
  },
  pageSub: {
    fontSize: 13,
    marginTop: 2,
    color: "var(--ant-color-text-tertiary)",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  searchBox: {
    width: 220,
    maxWidth: "44%",
    marginLeft: "auto",
  },
  card: {
    backgroundColor: "var(--ant-color-bg-container)",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "var(--ant-color-border-secondary)",
    borderRadius: 10,
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    padding: "13px 18px",
    cursor: "pointer",
    textAlign: "left",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ant-color-fill-quaternary)",
    },
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--ant-color-text)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 3,
    color: "var(--ant-color-text-tertiary)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  rowSide: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  emptyBox: {
    padding: "48px 0",
  },
});

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
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/editor/${article.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/editor/${article.id}`);
      }}
      {...stylex.props(styles.row, showBorder && styles.rowBorder)}
    >
      <div {...stylex.props(styles.rowMain)}>
        <span {...stylex.props(styles.rowTitle)}>
          {article.title || "（无标题）"}
        </span>
        <span {...stylex.props(styles.rowMeta)}>
          {fmtDate(article.updatedAt)} · 约 {countWords(article.content)} 字
        </span>
      </div>
      <div {...stylex.props(styles.rowSide)}>
        <Tag bordered={false} color={published ? "success" : undefined}>
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
            icon={<DeleteOutlined />}
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
    <div {...stylex.props(styles.view)}>
      <div {...stylex.props(styles.pageHead)}>
        <div>
          <div {...stylex.props(styles.pageTitle)}>文章</div>
          <div {...stylex.props(styles.pageSub)}>
            共 {articles.length} 篇 · {activeSite.name}
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={creating}
          onClick={handleCreate}
        >
          新建文章
        </Button>
      </div>

      <div {...stylex.props(styles.filterRow)}>
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
          prefix={<SearchOutlined />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          {...stylex.props(styles.searchBox)}
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
        <div {...stylex.props(styles.card, styles.emptyBox)}>
          <Empty
            description={
              articles.length === 0
                ? "还没有文章，第一篇文章往往最难，也最重要。"
                : "没有匹配的文章，换个关键词试试。"
            }
          >
            {articles.length === 0 && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                写一篇文章
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        <div {...stylex.props(styles.card)}>
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
