import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntdApp, Button, Select, Spin } from "antd";
import { ArrowLeft, Eye } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { editorStyles } from "../styles/editor.stylex";
import { WordmaEditor } from "@wordma/editor";
import { useLocation } from "wouter";
import { useSite } from "../context/SiteContext";
import {
  getArticle,
  updateArticle,
  type Article,
  type ArticleStatus,
} from "../lib/article";
import { openPreview, previewMarkdownHtml, renderSite } from "../lib/theme";
import {
  listMedia,
  uploadMedia,
  mediaPublicUrl,
} from "../lib/media";
import MediaPickerModal from "../components/MediaPickerModal";
import { countWords, fmtDate } from "../lib/words";

// 布局对应设计稿 .editor（顶栏 + 居中窄栏编辑区）
const styles = stylex.create({
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
    marginLeft: "auto",
    color: "var(--ant-color-text-tertiary)",
  },
  slugInput: {
    width: 120,
    borderStyle: "none",
    background: "var(--ant-color-fill-tertiary)",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 12,
    color: "var(--ant-color-text-secondary)",
    outlineStyle: "none",
  },
  metaSelect: {
    minWidth: 130,
  },
  metaTags: {
    minWidth: 180,
    maxWidth: 300,
  },
});

export default function ArticleEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const { activeSite, reloadArticles, reloadMedia, tags, categories } = useSite();
  const { message } = AntdApp.useApp();
  const [, navigate] = useLocation();
  const [article, setArticle] = useState<Article | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<ArticleStatus>("draft");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [slug, setSlug] = useState("");
  // filename → 磁盘绝对路径：编辑器显示图片时把 /media/x 解析为 asset 地址
  const mediaPathsRef = useRef<Record<string, string>>({});
  const [mediaReady, setMediaReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerResolver = useRef<((url: string | null) => void) | null>(null);

  // 粘贴/拖入图片：上传到媒体库后插入
  const handlePasteImage = useCallback(
    async (file: File) => {
      try {
        const media = await uploadMedia(activeSite.id, file);
        mediaPathsRef.current = {
          ...mediaPathsRef.current,
          [media.filename]: media.path,
        };
        reloadMedia();
        return mediaPublicUrl(media);
      } catch (e) {
        message.error(String(e));
        return null;
      }
    },
    [activeSite.id, reloadMedia],
  );

  // 实时预览：内容变化后防抖走 Rust 渲染管线（与发布同引擎）
  useEffect(() => {
    if (!article) return;
    const timer = setTimeout(() => {
      previewMarkdownHtml(activeSite.id, content)
        .then(setPreviewHtml)
        .catch((e) =>
          setPreviewHtml(
            `<p style="color:#d64545;font-family:system-ui">预览失败：${String(e)}</p>`,
          ),
        );
    }, 400);
    return () => clearTimeout(timer);
  }, [content, activeSite.id, article]);

  // 站点媒体清单变化时刷新 filename → path 映射（编辑器挂载前必须就绪）
  useEffect(() => {
    setMediaReady(false);
    listMedia(activeSite.id)
      .then((list) => {
        const map: Record<string, string> = {};
        for (const m of list) map[m.filename] = m.path;
        mediaPathsRef.current = map;
      })
      .catch(() => {})
      .finally(() => setMediaReady(true));
  }, [activeSite.id]);

  // 工具栏“插入图片”：打开媒体库选择
  const handlePickImage = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        pickerResolver.current = resolve;
        setPickerOpen(true);
      }),
    [],
  );

  const closePicker = (url: string | null) => {
    setPickerOpen(false);
    pickerResolver.current?.(url);
    pickerResolver.current = null;
  };
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
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
        setCategoryIds(a.categories.map((c) => c.id));
        setTagIds(a.tags.map((t) => t.id));
        setSlug(a.slug);
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
        slug: slug.trim(),
        categoryIds,
        tagIds,
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

  // 保存当前状态 → 渲染站点 → 打开浏览器预览
  const handlePreview = async () => {
    if (!article) return;
    setPreviewing(true);
    try {
      await updateArticle(article.id, {
        title: title.trim(),
        content,
        status,
        slug: slug.trim(),
        categoryIds,
        tagIds,
      });
      reloadArticles();
      await renderSite(activeSite.id);
      // 跳转到当前文章的预览页（草稿也会渲染详情页）
      await openPreview(activeSite.id, article.id);
    } catch (e) {
      message.error(String(e));
    } finally {
      setPreviewing(false);
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
        <span {...stylex.props(editorStyles.saveHint)}>{loadError}</span>
        <Button onClick={() => navigate("/articles")}>返回列表</Button>
      </div>
    );
  }

  if (!article || !mediaReady) {
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
    <div {...stylex.props(editorStyles.shell)}>
      <div {...stylex.props(editorStyles.topBar)}>
        <Button
          type="text"
          size="small"
          icon={<ArrowLeft size={14} />}
          onClick={() => navigate("/articles")}
        >
          返回列表
        </Button>
        <span {...stylex.props(editorStyles.saveHint)}>
          {status === "published" ? "已发布" : "草稿"}
          {savedAt ? ` · ${fmtDate(savedAt)}` : ""}
        </span>
        <div {...stylex.props(x.flex[1])} />
        <Button
          size="small"
          icon={<Eye size={14} />}
          loading={previewing}
          onClick={handlePreview}
        >
          预览
        </Button>
        <Button size="small" disabled={saving || previewing} onClick={() => handleSave("draft")}>
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
      <div {...stylex.props(editorStyles.body)}>
        <div {...stylex.props(editorStyles.col)}>
          <input
            {...stylex.props(editorStyles.titleInput)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题…"
            aria-label="文章标题"
          />
          {titleError && (
            <span {...stylex.props(editorStyles.fieldError)}>
              发布前需要先写一个标题
            </span>
          )}
          <div {...stylex.props(styles.editorMeta)}>
            <input
              {...stylex.props(styles.slugInput)}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug"
              aria-label="文章 slug"
              spellCheck={false}
            />
            <Select
              mode="multiple"
              variant="borderless"
              placeholder="添加分类"
              value={categoryIds}
              onChange={(v) => setCategoryIds(v)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              {...stylex.props(styles.metaSelect)}
            />
            <Select
              mode="multiple"
              variant="borderless"
              placeholder="添加标签"
              value={tagIds}
              onChange={(v) => setTagIds(v)}
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
              {...stylex.props(styles.metaTags)}
            />
            <span {...stylex.props(styles.wordCount)}>
              约 {countWords(content)} 字
            </span>
          </div>
          <WordmaEditor
            key={article.id}
            initialValue={content}
            onChange={setContent}
            onPasteImage={handlePasteImage}
            onPickImage={handlePickImage}
            previewHtml={previewHtml ?? undefined}
          />
          <MediaPickerModal open={pickerOpen} onClose={closePicker} />
        </div>
      </div>
    </div>
  );
}
