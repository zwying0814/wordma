import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import type { JSONContent } from "@wordma/editor-schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { getPage, updatePage } from "../lib/pages";
import { InlineAlert } from "../components/common/inline-alert";
import { LoadingScreen } from "../components/common/loading";
import {
  EditorBody,
  EditorColumn,
  EditorShell,
  EditorTitleInput,
  EditorTopBar,
} from "../components/common/editor-shell";
import MediaPickerModal from "../components/MediaPickerModal";
import { WordmaEditor, type WordmaEditorHandle } from "../editor/WordmaEditor";
import { parseInitialContent } from "../editor/lib/initial-content";
import { useEditorMedia } from "../editor/lib/use-editor-media";
import type { EditorSnapshot } from "../editor/types";

/** 独立页面编辑器：标题 + slug + 内容 */
export default function PageEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const [, navigate] = useLocation();
  const editorRef = useRef<WordmaEditorHandle>(null);
  const { imageUrls, pickerOpen, handlePasteImage, handlePickImage, closePicker } =
    useEditorMedia();

  const [page, setPage] = useState<Awaited<ReturnType<typeof getPage>> | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [initialContent, setInitialContent] = useState<
    JSONContent | string | null
  >(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [showInNav, setShowInNav] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPage(Number(params.id))
      .then((p) => {
        if (cancelled) return;
        const parsed = parseInitialContent(p.content, p.contentFormat);
        setPage(p);
        setTitle(p.title);
        setSlug(p.slug);
        setInitialContent(parsed.value);
        setContentError(parsed.error);
        setSnapshot(null);
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
    const snapshot = editorRef.current?.getSnapshot();
    if (!snapshot) {
      toast.error("编辑器尚未就绪");
      return;
    }
    setSaving(true);
    try {
      const saved = await updatePage(page.id, {
        title: title.trim(),
        content: JSON.stringify(snapshot.json),
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

  if (!page || initialContent === null) {
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
      <EditorBody scroll={false}>
        <EditorColumn fill className="max-w-[760px]">
          <div className="shrink-0">
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
              <span className="ml-auto text-xs text-muted-foreground">
                约 {snapshot?.wordCount ?? page.wordCount} 字
              </span>
            </div>
            {contentError ? (
              <InlineAlert className="mb-3">{contentError}</InlineAlert>
            ) : null}
          </div>
          <WordmaEditor
            key={page.id}
            ref={editorRef}
            initialContent={initialContent}
            placeholder="开始写…"
            onChange={setSnapshot}
            onPasteImage={handlePasteImage}
            onPickImage={handlePickImage}
            onResolveImageUrl={(src) => imageUrls.get(src) ?? src}
          />
        </EditorColumn>
      </EditorBody>
      <MediaPickerModal open={pickerOpen} onClose={closePicker} />
    </EditorShell>
  );
}
