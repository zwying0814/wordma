import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteMedia,
  formatBytes,
  listMedia,
  mediaItemSrc,
  mediaPublicUrl,
  uploadMedia,
  type MediaItem,
} from "../lib/media";
import { useSite } from "../context/SiteContext";
import { ConfirmDialog } from "./common/confirm-dialog";
import { EmptyState } from "./common/empty-state";

interface Props {
  open: boolean;
  /** 关闭弹窗：url 为 null 表示取消 */
  onClose: (url: string | null) => void;
}

/** 媒体库选择弹窗：供编辑器插入图片（选择已有或先上传） */
export default function MediaPickerModal({ open, onClose }: Props) {
  const { activeSite } = useSite();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listMedia(activeSite.id)
      .then(setItems)
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [activeSite.id]);

  useEffect(() => {
    if (open) {
      setSelected(null);
      reload();
    }
  }, [open, reload]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        await uploadMedia(activeSite.id, file);
      }
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMedia(pendingDelete.id);
      if (selected?.id === pendingDelete.id) setSelected(null);
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPendingDelete(null);
    }
  };

  const handleOk = () => {
    if (!selected) {
      toast.warning("请先选择一个媒体文件");
      return;
    }
    onClose(mediaPublicUrl(selected));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose(null);
      }}
    >
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>从媒体库插入图片</DialogTitle>
          <DialogDescription>
            选择已有文件，或先上传新的图片/视频。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,video/mp4,video/webm,video/quicktime"
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
            上传图片/视频
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="媒体库还是空的"
            description="先上传几张图片吧。"
          />
        ) : (
          <div className="grid max-h-[50vh] grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 overflow-y-auto">
            {items.map((item) => {
              const active = selected?.id === item.id;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    // 点击删除按钮时不要误选中该条目
                    if ((e.target as HTMLElement).closest("button")) return;
                    setSelected(item);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelected(item);
                  }}
                  className={
                    "relative cursor-pointer overflow-hidden rounded-md bg-muted " +
                    (active
                      ? "border-2 border-primary"
                      : "border border-border")
                  }
                >
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
                    {item.kind === "image" ? (
                      <img
                        src={mediaItemSrc(item)}
                        alt={item.originalName}
                        className="block size-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 p-2 text-center text-[11px] text-muted-foreground">
                        <Film className="size-5" />
                        {item.originalName}
                      </div>
                    )}
                  </div>
                  <div className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">
                    {item.originalName} · {formatBytes(item.size)}
                  </div>
                  <div
                    className="absolute top-1 right-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="outline"
                      size="icon-xs"
                      className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                      aria-label={`删除「${item.originalName}」`}
                      onClick={() => setPendingDelete(item)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(null)}>
            取消
          </Button>
          <Button disabled={selected === null} onClick={handleOk}>
            插入
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除媒体"
        description="文章中的引用将失效，确定删除？"
        confirmLabel="删除"
        destructive
        onConfirm={handleRemove}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      />
    </Dialog>
  );
}
