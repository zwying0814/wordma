'use client';

import { ImagePlugin } from '@platejs/media/react';

import { ImageElement } from '@/components/ui/image-node';
import { MediaPreviewDialog } from '@/components/ui/media-preview-dialog';

export const MediaKit = [
  ImagePlugin.configure({
    options: { disableUploadInsert: true },
    render: { afterEditable: MediaPreviewDialog, node: ImageElement },
  }),
];
