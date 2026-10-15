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

/** 在系统文件管理器中显示该媒体文件 */
export function revealMedia(item: MediaItem): void {
  void window.api.invoke('reveal_media', { path: item.path });
}

/** 文章内引用地址（渲染拷贝到 dist/media/ 后的公开路径） */
export function mediaPublicUrl(item: MediaItem): string {
  return `/media/${item.filename}`;
}

/** 复制 Markdown 引用到剪贴板 */
export async function copyMarkdown(item: MediaItem): Promise<void> {
  const md =
    item.kind === 'image'
      ? `![${item.originalName}](/media/${item.filename})`
      : `[${item.originalName}](/media/${item.filename})`;
  await navigator.clipboard.writeText(md);
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
