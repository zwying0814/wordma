'use client';

import { ImagePlusIcon } from 'lucide-react';
import { KEYS, isUrl } from 'platejs';
import { useEditorRef } from 'platejs/react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { ToolbarButton } from './toolbar';

export function ImageToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');

  const insertImage = () => {
    if (!url || !isUrl(url)) return;

    editor.tf.insertNodes(
      { children: [{ text: '' }], type: KEYS.img, url },
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
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            data-testid="image-url-input"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                insertImage();
              }
            }}
            placeholder="Paste image URL..."
            value={url}
          />
          <Button
            className="h-8 shrink-0 px-3 text-sm"
            disabled={!url || !isUrl(url)}
            onClick={insertImage}
            type="button"
          >
            Insert
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
