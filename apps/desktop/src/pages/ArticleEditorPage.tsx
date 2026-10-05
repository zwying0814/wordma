import { useEffect, useState } from "react";
import { App as AntdApp, Button, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { useLocation } from "wouter";
import { useSite } from "../context/SiteContext";
import {
  getArticle,
  updateArticle,
  type Article,
  type ArticleStatus,
} from "../lib/article";
import { countWords, fmtDate } from "../lib/words";

// 布局对应设计稿 .editor（顶栏 + 居中窄栏编辑区）
const styles = stylex.create({
  editor: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    backgroundColor: "var(--ant-color-bg-container)",
  },
  editorTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 20px",
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  saveHint: {
    fontSize: 12,
    color: "var(--ant-color-text-tertiary)",
  },
  editorBody: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    justifyContent: "center",
    overflowY: "auto",
  },
  editorCol: {
    width: "100%",
    maxWidth: 780,
    padding: "28px 32px 64px",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  titleInput: {
    width: "100%",
    borderStyle: "none",
    background: "transparent",
    padding: "0 0 6px",
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.4,
    color: "var(--ant-color-text)",
    minWidth: 0,
  },
  fieldError: {
    fontSize: 12,
    color: "var(--ant-color-error)",
    marginBottom: 4,
  },
  editorMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 0 14px",
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  wordCount: {
    fontSize: 12,
    color: "var(--ant-color-text-tertiary)",
  },
  contentInput: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    borderStyle: "none",
    background: "transparent",
    padding: 0,
    fontFamily:
    '"Noto Serif SC", "Songti SC", "SimSun", serif',
    fontSize: 15,
    lineHeight: 1.9,
    color: "var(--ant-color-text)",
    resize: "none",
  },
});

export default function ArticleEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const { reloadArticles } = useSite();
  const { message } = AntdApp.useApp();
  const [, navigate] = useLocation();
  const [article, setArticle] = useState<Article | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<ArticleStatus>("draft");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getArticle(Number(params.id))
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
        setTitle(a.title);
        setContent(a.content);
        setStatus(a.status);
        setSavedAt(a.updatedAt);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleSave = async (next: ArticleStatus) => {
    if (!article) return;
    if (next === "published" && !title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      const saved = await updateArticle(article.id, {
        title: title.trim(),
        content,
        status: next,
      });
      setArticle(saved);
      setStatus(saved.status);
      setSavedAt(saved.updatedAt);
      setTitleError(false);
      reloadArticles();
      message.success(next === "published" ? "已发布" : "草稿已保存");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loadError !== null) {
    return (
      <div
        {...stylex.props(
          x.display.flex,
          x.flexDirection.column,
          x.alignItems.center,
          x.justifyContent.center,
          x.gap._16px,
          x.height["100%"],
        )}
      >
        <span {...stylex.props(styles.saveHint)}>{loadError}</span>
        <Button onClick={() => navigate("/articles")}>返回列表</Button>
      </div>
    );
  }

  if (!article) {
    return (
      <div
        {...stylex.props(
          x.display.flex,
          x.alignItems.center,
          x.justifyContent.center,
          x.height["100%"],
        )}
      >
        <Spin />
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.editor)}>
      <div {...stylex.props(styles.editorTop)}>
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/articles")}
        >
          返回列表
        </Button>
        <span {...stylex.props(styles.saveHint)}>
          {status === "published" ? "已发布" : "草稿"}
          {savedAt ? ` · ${fmtDate(savedAt)}` : ""}
        </span>
        <div {...stylex.props(x.flex[1])} />
        <Button size="small" disabled={saving} onClick={() => handleSave("draft")}>
          存为草稿
        </Button>
        <Button
          type="primary"
          size="small"
          loading={saving}
          onClick={() => handleSave("published")}
        >
          {status === "published" ? "更新发布" : "发布"}
        </Button>
      </div>
      <div {...stylex.props(styles.editorBody)}>
        <div {...stylex.props(styles.editorCol)}>
          <input
            {...stylex.props(styles.titleInput)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题…"
            aria-label="文章标题"
          />
          {titleError && (
            <span {...stylex.props(styles.fieldError)}>
              发布前需要先写一个标题
            </span>
          )}
          <div {...stylex.props(styles.editorMeta)}>
            <span {...stylex.props(styles.wordCount)}>
              约 {countWords(content)} 字
            </span>
          </div>
          {/* 编辑器占位：先使用 textarea，后续再接入正式编辑器 */}
          <textarea
            {...stylex.props(styles.contentInput)}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="正文支持 Markdown：## 小标题、- 列表、> 引用、**加粗**…"
            aria-label="文章正文"
          />
        </div>
      </div>
    </div>
  );
}
