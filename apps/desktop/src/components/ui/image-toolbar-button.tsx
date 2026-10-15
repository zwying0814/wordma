'use client';

import * as React from 'react';

import { ImagePlusIcon } from 'lucide-react';
import { KEYS, isUrl } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { useSite } from '@/context/SiteContext';
import { listMedia, mediaUrl } from '@/lib/media';
import type { MediaItem } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { ToolbarButton } from './toolbar';

/** isUrl 之外额外接受 data:image 内联图片（canvas 生成、粘贴场景） */
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/;
const canInsertImage = (src: string): boolean =>
  isUrl(src) || DATA_IMAGE_RE.test(src);

/** 图片插入按钮：URL 直填 + 媒体库网格选择（点击即插入 wordma-media:// 图片） */
export function ImageToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();
  const { activeSite } = useSite();
  const siteId = activeSite?.id ?? null;

  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [items, setItems] = React.useState<MediaItem[]>([]);

  React.useEffect(() => {
    if (!open || siteId === null) return;
    let cancelled = false;
    void listMedia(siteId)
      .then((list) => {
        if (!cancelled) setItems(list.filter((item) => item.kind === 'image'));
      })
      .catch(() => setItems([]));
    return () => {
      cancelled = true;
    };
  }, [open, siteId]);

  const insertImage = (src: string) => {
    editor.tf.insertNodes(
      { children: [{ text: '' }], type: KEYS.img, url: src },
      { select: true }
    );
    setOpen(false);
    setUrl('');
  };

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setUrl('');
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <ToolbarButton
            {...props}
            aria-label="Image"
            isDropdown={false}
            pressed={open}
            tooltip="Image"
          >
            <ImagePlusIcon />
          </ToolbarButton>
        }
      />
      <PopoverContent className="w-[330px] rounded-md border bg-popover p-2 shadow-md">
        {/* 媒体库网格 */}
        {siteId !== null && items.length > 0 && (
          <div
            className="mb-2 grid max-h-40 grid-cols-4 gap-1 overflow-y-auto"
            data-testid="media-picker-grid"
          >
            {items.map((item) => (
              <button
                className="aspect-square cursor-pointer overflow-hidden rounded border bg-muted/30 hover:ring-2 hover:ring-ring"
                key={item.id}
                onClick={() => insertImage(mediaUrl(siteId, item.filename))}
                title={item.originalName}
                type="button"
              >
                <img
                  alt={item.originalName}
                  className="size-full object-cover"
                  src={mediaUrl(siteId, item.filename)}
                />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="image-url-input"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (canInsertImage(url)) insertImage(url);
              }
            }}
            placeholder="Paste image URL..."
            value={url}
          />
          <Button
            className="h-8 shrink-0 px-3 text-sm"
            disabled={!canInsertImage(url)}
            onClick={() => insertImage(url)}
            type="button"
          >
            Insert
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
