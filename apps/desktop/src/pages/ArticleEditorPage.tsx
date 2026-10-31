import { useEffect, useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "../context/SiteContext";
import {
  getArticle,
  updateArticle,
  type Article,
  type ArticleStatus,
} from "../lib/article";
import { openPreview, renderSite } from "../lib/theme";
import { fmtDate } from "../lib/words";
import { LoadingScreen } from "../components/common/loading";
import {
  EditorBody,
  EditorColumn,
  EditorFieldError,
  EditorShell,
  EditorTitleInput,
  EditorTopBar,
} from "../components/common/editor-shell";
import { MultiSelect } from "../components/common/multi-select";

export default function ArticleEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const { activeSite, reloadArticles, tags, categories } = useSite();
  const [, navigate] = useLocation();
  const [article, setArticle] = useState<Article | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<ArticleStatus>("draft");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [slug, setSlug] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
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
      toast.success(next === "published" ? "已发布" : "草稿已保存");
    } catch (e) {
      toast.error(String(e));
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
      toast.error(String(e));
    } finally {
      setPreviewing(false);
    }
  };

  if (loadError !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span className="text-xs text-muted-foreground">{loadError}</span>
        <Button onClick={() => navigate("/articles")}>返回列表</Button>
      </div>
    );
  }

  if (!article) {
    return <LoadingScreen />;
  }

  return (
    <EditorShell>
      <EditorTopBar>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/articles")}
        >
          <ArrowLeft className="size-3.5" />
          返回列表
        </Button>
        <span className="text-xs text-muted-foreground">
          {status === "published" ? "已发布" : "草稿"}
          {savedAt ? ` · ${fmtDate(savedAt)}` : ""}
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={previewing}
          onClick={handlePreview}
        >
          {previewing ? (
            <Spinner className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
          预览
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={saving || previewing}
          onClick={() => handleSave("draft")}
        >
          存为草稿
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={() => handleSave("published")}
        >
          {saving ? <Spinner className="size-3.5" /> : null}
          {status === "published" ? "更新发布" : "发布"}
        </Button>
      </EditorTopBar>
      <EditorBody>
        <EditorColumn>
          <EditorTitleInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题…"
            aria-label="文章标题"
          />
          {titleError && (
            <EditorFieldError>发布前需要先写一个标题</EditorFieldError>
          )}
          <div className="mt-0 mb-[18px] flex flex-wrap items-center gap-2 border-b border-border pt-2.5 pb-3.5">
            <input
              className="w-[120px] rounded-sm border-0 bg-muted px-2 py-[3px] text-xs text-muted-foreground outline-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug"
              aria-label="文章 slug"
              spellCheck={false}
            />
            <MultiSelect
              label="添加分类"
              placeholder="添加分类"
              className="min-w-[130px]"
              value={categoryIds}
              onChange={setCategoryIds}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <MultiSelect
              label="添加标签"
              placeholder="添加标签"
              className="min-w-[180px] max-w-[300px]"
              value={tagIds}
              onChange={setTagIds}
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
            />
            <span className="ml-auto text-xs text-muted-foreground">
              约 {article.wordCount} 字
            </span>
          </div>
        </EditorColumn>
      </EditorBody>
    </EditorShell>
  );
}
