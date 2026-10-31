import { useCallback, useEffect, useRef, useState } from "react";
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
import { useDocumentAutosave } from "../editor/lib/use-document-autosave";
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
  const [initialContent, setInitialContent] = useState<JSONContent | null>(
    null,
  );
  const [contentError, setContentError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [showInNav, setShowInNav] = useState(true);

  const persistDocument = useCallback(
    async (silent: boolean) => {
      if (!page || contentError) return false;
      const nextTitle = title.trim();
      if (!nextTitle) {
        if (!silent) toast.error("页面标题不能为空");
        return false;
      }
      const latest = editorRef.current?.getSnapshot();
      if (!latest) return false;
      try {
        const saved = await updatePage(page.id, {
          title: nextTitle,
          content: JSON.stringify(latest.json),
          slug: slug.trim(),
          showInNav,
        });
        setPage(saved);
        setSlug(saved.slug);
        if (!silent) toast.success("页面已保存");
        return true;
      } catch (e) {
        toast.error(String(e));
        return false;
      }
    },
    [page, contentError, title, slug, showInNav],
  );

  const {
    markDirty,
    persist,
    reset,
    dirty,
    state: saveState,
  } = useDocumentAutosave({
    enabled:
      page !== null &&
      initialContent !== null &&
      contentError === null &&
      title.trim().length > 0,
    save: persistDocument,
  });

  useEffect(() => {
    let cancelled = false;
    getPage(Number(params.id))
      .then((p) => {
        if (cancelled) return;
        const parsed = parseInitialContent(p.content);
        setPage(p);
        setTitle(p.title);
        setSlug(p.slug);
        setInitialContent(parsed.value);
        setContentError(parsed.error);
        setSnapshot(null);
        setShowInNav(p.showInNav);
        reset();
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, reset]);

  const handleEditorChange = useCallback(
    (next: EditorSnapshot) => {
      setSnapshot(next);
      markDirty();
    },
    [markDirty],
  );

  const handleSave = async () => {
    if (contentError) {
      toast.error("正文 JSON 损坏，已阻止保存以免覆盖；请先备份并修复数据");
      return;
    }
    await persist(false);
  };

  const handleBack = async () => {
    if (dirty && !(await persist(false))) return;
    navigate("/pages");
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

  const saving = saveState === "saving";
  const saveLabel =
    saveState === "saving"
      ? "保存中…"
      : saveState === "error"
        ? "保存失败"
        : dirty
          ? "未保存"
          : saveState === "saved"
            ? "已保存"
            : "";

  return (
    <EditorShell>
      <EditorTopBar>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleBack()}
        >
          <ArrowLeft className="size-3.5" />
          返回列表
        </Button>
        <span className="text-xs text-muted-foreground">{saveLabel}</span>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <Checkbox
            checked={showInNav}
            onCheckedChange={(checked) => {
              setShowInNav(checked === true);
              markDirty();
            }}
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
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              placeholder="页面标题…"
              aria-label="页面标题"
            />
            <div className="mt-0 mb-[18px] flex items-center gap-2 border-b border-border pt-2.5 pb-3.5">
              <input
                className="w-[140px] rounded-sm border-0 bg-muted px-2 py-[3px] text-xs text-muted-foreground outline-none"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  markDirty();
                }}
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
            onChange={handleEditorChange}
            onPasteImage={handlePasteImage}
            onPickImage={handlePickImage}
            onResolveImageUrl={(src) => imageUrls.get(src) ?? src}
          />
        </EditorColumn>
      </EditorBody>
      <MediaPickerModal
        open={pickerOpen}
        acceptKind="image"
        onClose={closePicker}
      />
    </EditorShell>
  );
}
