import type { MediaItem } from '@/types/api';

export function listMedia(siteId: number): Promise<MediaItem[]> {
  return window.api.invoke('list_media', { siteId }) as Promise<MediaItem[]>;
}

export function uploadMediaFromPath(payload: {
  siteId: number;
  filePath: string;
  originalName?: string;
}): Promise<MediaItem> {
  return window.api.invoke(
    'upload_media_from_path',
    payload
  ) as Promise<MediaItem>;
}

export function uploadMediaData(payload: {
  siteId: number;
  base64: string;
  originalName: string;
}): Promise<MediaItem> {
  return window.api.invoke('upload_media_data', payload) as Promise<MediaItem>;
}

export function deleteMedia(id: number): Promise<void> {
  return window.api.invoke('delete_media', { id }) as Promise<void>;
}

export function mediaUrl(siteId: number, filename: string): string {
  // host 用字面量 'media'：纯数字 host 会被 Chromium 当 IPv4 解析
  return `wordma-media://media/${siteId}/${filename}`;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
