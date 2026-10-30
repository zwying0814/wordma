import { useEffect, useRef, useState } from "react";
import { Copy, Film, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSite } from "../context/SiteContext";
import {
  deleteMedia,
  formatBytes,
  mediaItemSrc,
  mediaPublicUrl,
  uploadMedia,
  type MediaItem,
} from "../lib/media";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { EmptyState } from "../components/common/empty-state";
import { PageHeader } from "../components/common/page-header";
import { PageView } from "../components/common/page-view";

const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime";

export default function MediaPage() {
  const { activeSite, media, reloadMedia } = useSite();
  const items = media;
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = reloadMedia;

  useEffect(() => {
    reload();
  }, [reload]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        await uploadMedia(activeSite.id, file);
        toast.success(`「${file.name}」已上传`);
      }
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMedia(pendingDelete.id);
      reload();
      toast.success("媒体文件已删除");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPendingDelete(null);
    }
  };

  const copyMarkdown = (item: MediaItem) => {
    const md =
      item.kind === "image"
        ? `![${item.originalName}](${mediaPublicUrl(item)})`
        : `[${item.originalName}](${mediaPublicUrl(item)})`;
    navigator.clipboard
      .writeText(md)
      .then(() => toast.success("Markdown 已复制，可粘贴到文章中"))
      .catch(() => toast.error("复制失败"));
  };

  return (
    <PageView>
      <PageHeader
        title="媒体库"
        subtitle={`共 ${items.length} 个文件 · 上传图片和视频，在文章编辑器中插入`}
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void handleFiles(files);
              }}
            />
            <Button
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Spinner className="size-3.5" />
              ) : (
                <Upload className="size-3.5" />
              )}
              上传
            </Button>
          </>
        }
      />

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            icon={ImageIcon}
            title="媒体库还是空的"
            description="上传图片或视频后即可在文章中插入。"
            action={
              <Button
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                上传文件
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card"
            >
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
                {item.kind === "image" ? (
                  <img
                    src={mediaItemSrc(item)}
                    alt={item.originalName}
                    loading="lazy"
                    className="block size-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 p-3 text-center text-xs break-all text-muted-foreground">
                    <Film className="size-6" />
                    {item.originalName}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2">
                <span
                  className="min-w-0 truncate text-xs text-muted-foreground"
                  title={item.originalName}
                >
                  {item.originalName}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground/70">
                  {formatBytes(item.size)}
                </span>
              </div>
              <div className="flex justify-center gap-1 pb-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="复制 Markdown 引用"
                  aria-label={`复制「${item.originalName}」的 Markdown 引用`}
                  onClick={() => copyMarkdown(item)}
                >
                  <Copy className="size-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  aria-label={`删除「${item.originalName}」`}
                  onClick={() => setPendingDelete(item)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除媒体"
        description="文章中的引用将失效，确定删除？"
        confirmLabel="删除"
        destructive
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </PageView>
  );
}
