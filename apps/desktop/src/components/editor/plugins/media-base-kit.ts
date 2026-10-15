import { BaseImagePlugin } from '@platejs/media';

import { ImageElementStatic } from '@/components/ui/media-image-node-static';

export const BaseMediaKit = [
  BaseImagePlugin.withComponent(ImageElementStatic),
];
