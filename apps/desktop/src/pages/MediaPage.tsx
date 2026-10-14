import * as React from 'react';

import { Trash2, UploadIcon } from 'lucide-react';

import { useSite } from '@/context/SiteContext';
import { formatBytes, listMedia, mediaUrl, uploadMediaFromPath } from '@/lib/media';
import type { MediaItem } from '@/types/api';
import { Button } from '@/components/ui/button';

/** 媒体库页：/media（网格 + 上传 + 删除） */
export function MediaPage() {
  const { activeSite } = useSite();
  const siteId = activeSite?.id ?? null;

  const [items, setItems] = React.useState<MediaItem[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reload = React.useCallback(async () => {
    if (siteId === null) {
      setItems([]);
      return;
    }
    setItems(await listMedia(siteId));
  }, [siteId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || siteId === null) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const filePath = window.api.getPathForFile(file);
        await uploadMediaFromPath({
          siteId,
          filePath,
          originalName: file.name,
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (siteId === null) return;
    try {
      await window.api.invoke('delete_media', { id: item.id });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col p-8" data-testid="media-page">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-xl tracking-tight">媒体库</h1>
        <Button
          data-testid="media-upload"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon className="size-4" />
          {uploading ? '上传中…' : '上传'}
        </Button>
        <input
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm,.mov"
          className="hidden"
          data-testid="media-file-input"
          multiple
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
          ref={inputRef}
          type="file"
        />
      </div>

      {error && (
        <p className="mt-3 text-destructive text-sm" data-testid="media-error">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          暂无媒体，点击右上角上传。
        </div>
      ) : (
        <div
          className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 overflow-y-auto"
          data-testid="media-grid"
        >
          {items.map((item) => (
            <figure
              className="group relative overflow-hidden rounded-lg border bg-muted/30"
              data-testid={`media-item-${item.filename}`}
              key={item.id}
            >
              {item.kind === 'image' ? (
                <img
                  alt={item.originalName}
                  className="h-28 w-full object-cover"
                  src={mediaUrl(siteId as number, item.filename)}
                />
              ) : (
                <div className="flex h-28 items-center justify-center text-muted-foreground text-xs">
                  {item.mimeType}
                </div>
              )}
              <figcaption className="truncate px-2 py-1 text-muted-foreground text-xs">
                {item.originalName} · {formatBytes(item.size)}
              </figcaption>
              <Button
                aria-label={`删除 ${item.originalName}`}
                className="absolute top-1 right-1 hidden group-hover:inline-flex"
                data-testid={`media-delete-${item.filename}`}
                onClick={() => void handleDelete(item)}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
