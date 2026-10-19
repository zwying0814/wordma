import * as React from 'react';

import { Copy, FolderOpen, ImageIcon, Trash2, UploadIcon } from 'lucide-react';

import { useSite } from '@/context/SiteContext';
import {
  copyMarkdown,
  formatBytes,
  listMedia,
  mediaUrl,
  revealMedia,
  uploadMediaFromPath,
} from '@/lib/media';
import type { MediaItem } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/lib/use-toast';

/** 媒体库页：/media（网格 + 上传 + 删除） */
export function MediaPage() {
  const { activeSite } = useSite();
  const { toast } = useToast();
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
      const files = Array.from(fileList);
      for (const file of files) {
        const filePath = window.api.getPathForFile(file);
        await uploadMediaFromPath({
          siteId,
          filePath,
          originalName: file.name,
        });
      }
      await reload();
      toast(files.length > 1 ? `已上传 ${files.length} 个文件` : `已上传「${files[0]?.name ?? ''}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (siteId === null) return;
    try {
      await window.api.invoke('delete_media', { id: item.id });
      await reload();
      toast(`已删除「${item.originalName}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex h-full flex-col p-9" data-testid="media-page">
      <PageHeader
        actions={
          <Button
            data-testid="media-upload"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <UploadIcon className="size-4" />
            {uploading ? '上传中…' : '上传'}
          </Button>
        }
        subtitle={`共 ${items.length} 个文件 · 图片与视频`}
        title="媒体库"
      />
      <div className="hidden">
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
        <Card>
          <EmptyState
            description="上传的图片与视频会保存在站点目录的 media/ 下，可直接插入文章。"
            icon={ImageIcon}
            title="暂无媒体"
          >
            <Button onClick={() => inputRef.current?.click()}>
              <UploadIcon className="size-4" />
              上传文件
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 overflow-y-auto"
          data-testid="media-grid"
        >
          {items.map((item) => (
            <figure
              className="group relative overflow-hidden rounded-xl border border-border bg-muted/40 shadow-card"
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
              <figcaption className="truncate px-2.5 py-1.5 text-muted-foreground text-xs">
                {item.originalName} · {formatBytes(item.size)}
              </figcaption>
              <div className="absolute top-1.5 right-1.5 hidden gap-0.5 rounded-lg bg-card/90 p-0.5 shadow-card group-hover:inline-flex">
                <Button
                  aria-label={`复制 Markdown 引用 ${item.originalName}`}
                  data-testid={`media-copy-${item.filename}`}
                  onClick={() => {
                    void copyMarkdown(item).then(() =>
                      toast('Markdown 引用已复制')
                    );
                  }}
                  size="icon-sm"
                  title="复制 Markdown 引用"
                  variant="ghost"
                >
                  <Copy />
                </Button>
                <Button
                  aria-label={`在文件夹中显示 ${item.originalName}`}
                  data-testid={`media-reveal-${item.filename}`}
                  onClick={() => revealMedia(item)}
                  size="icon-sm"
                  title="在文件夹中显示"
                  variant="ghost"
                >
                  <FolderOpen />
                </Button>
                <Button
                  aria-label={`删除 ${item.originalName}`}
                  data-testid={`media-delete-${item.filename}`}
                  onClick={() => void handleDelete(item)}
                  size="icon-sm"
                  title="删除"
                  variant="destructiveGhost"
                >
                  <Trash2 />
                </Button>
              </div>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
