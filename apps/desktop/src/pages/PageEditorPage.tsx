import { useEffect, useState } from "react";
import { App as AntdApp, Button, Checkbox, Spin } from "antd";
import { ArrowLeft } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { WordmaEditor } from "@wordma/editor";
import { useLocation } from "wouter";
import { getPage, updatePage } from "../lib/pages";
import { previewMarkdownHtml } from "../lib/theme";
import { editorStyles } from "../styles/editor.stylex";

const styles = stylex.create({
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 0 14px",
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--ant-color-border-secondary)",
  },
  slugInput: {
    width: 140,
    borderStyle: "none",
    background: "var(--ant-color-fill-tertiary)",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 12,
    color: "var(--ant-color-text-secondary)",
    outlineStyle: "none",
  },
});

/** 独立页面编辑器：标题 + slug + 内容（复用 WordmaEditor） */
export default function PageEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const { message } = AntdApp.useApp();
  const [, navigate] = useLocation();
  const [page, setPage] = useState<Awaited<ReturnType<typeof getPage>> | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [showInNav, setShowInNav] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPage(Number(params.id))
      .then((p) => {
        if (cancelled) return;
        setPage(p);
        setTitle(p.title);
        setSlug(p.slug);
        setContent(p.content);
        setShowInNav(p.showInNav);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // 实时预览：内容变化后防抖走 Rust 渲染管线（与发布同引擎）
  useEffect(() => {
    if (!page) return;
    const timer = setTimeout(() => {
      previewMarkdownHtml(page.siteId, content, true)
        .then(setPreviewHtml)
        .catch((e) =>
          setPreviewHtml(
            `<p style="color:#d64545;font-family:system-ui">预览失败：${String(e)}</p>`,
          ),
        );
    }, 400);
    return () => clearTimeout(timer);
  }, [page, content]);

  const handleSave = async () => {
    if (!page) return;
    if (!title.trim()) {
      message.error("页面标题不能为空");
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePage(page.id, {
        title: title.trim(),
        content,
        slug: slug.trim(),
        showInNav,
      });
      setPage(saved);
      setSlug(saved.slug);
      message.success("页面已保存");
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
        <span {...stylex.props(editorStyles.saveHint)}>{loadError}</span>
        <Button onClick={() => navigate("/pages")}>返回列表</Button>
      </div>
    );
  }

  if (!page) {
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
          onClick={() => navigate("/pages")}
        >
          返回列表
        </Button>
        <div {...stylex.props(x.flex[1])} />
        <Checkbox
          checked={showInNav}
          onChange={(e) => setShowInNav(e.target.checked)}
        >
          显示在站点导航
        </Checkbox>
        <Button
          type="primary"
          size="small"
          loading={saving}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>
      <div {...stylex.props(editorStyles.body)}>
        <div {...stylex.props(editorStyles.col)}>
          <input
            {...stylex.props(editorStyles.titleInput)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题…"
            aria-label="页面标题"
          />
          <div {...stylex.props(styles.metaRow)}>
            <input
              {...stylex.props(styles.slugInput)}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug"
              aria-label="页面 slug"
              spellCheck={false}
            />
          </div>
          <WordmaEditor
            key={page.id}
            initialValue={content}
            onChange={setContent}
            previewHtml={previewHtml ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
