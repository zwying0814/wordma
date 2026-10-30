import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { getPage, updatePage } from "../lib/pages";
import { LoadingScreen } from "../components/common/loading";
import {
  EditorBody,
  EditorColumn,
  EditorShell,
  EditorTitleInput,
  EditorTopBar,
} from "../components/common/editor-shell";

/** 独立页面编辑器：标题 + slug + 内容 */
export default function PageEditorPage({
  params,
}: {
  params: { id: string };
}) {
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

  const handleSave = async () => {
    if (!page) return;
    if (!title.trim()) {
      toast.error("页面标题不能为空");
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
      toast.success("页面已保存");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loadError !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <span className="text-xs text-muted-foreground">{loadError}</span>
        <Button onClick={() => navigate("/pages")}>返回列表</Button>
      </div>
    );
  }

  if (!page) {
    return <LoadingScreen />;
  }

  return (
    <EditorShell>
      <EditorTopBar>
        <Button variant="ghost" size="sm" onClick={() => navigate("/pages")}>
          <ArrowLeft className="size-3.5" />
          返回列表
        </Button>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <Checkbox
            checked={showInNav}
            onCheckedChange={(checked) => setShowInNav(checked === true)}
          />
          显示在站点导航
        </label>
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? <Spinner className="size-3.5" /> : null}
          保存
        </Button>
      </EditorTopBar>
      <EditorBody>
        <EditorColumn>
          <EditorTitleInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="页面标题…"
            aria-label="页面标题"
          />
          <div className="mt-0 mb-[18px] flex items-center gap-2 border-b border-border pt-2.5 pb-3.5">
            <input
              className="w-[140px] rounded-sm border-0 bg-muted px-2 py-[3px] text-xs text-muted-foreground outline-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug"
              aria-label="页面 slug"
              spellCheck={false}
            />
          </div>
        </EditorColumn>
      </EditorBody>
    </EditorShell>
  );
}
