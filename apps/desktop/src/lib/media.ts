import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export { convertFileSrc };

export type MediaKind = "image" | "video";

export interface MediaItem {
  id: number;
  siteId: number;
  filename: string;
  originalName: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  /** 磁盘绝对路径（asset 协议显示用） */
  path: string;
  createdAt: string;
}

export const listMedia = (siteId: number): Promise<MediaItem[]> =>
  invoke("list_media", { siteId });

export const uploadMedia = (
  siteId: number,
  file: File,
): Promise<MediaItem> => {
  const dataBase64 = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // dataURL 形如 data:image/png;base64,xxxx，取逗号后的 base64 部分
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
  return dataBase64.then((dataBase64) =>
    invoke("upload_media", {
      siteId,
      name: file.name,
      mimeType: file.type,
      dataBase64,
    }),
  );
};

export const deleteMedia = (id: number): Promise<void> =>
  invoke("delete_media_cmd", { id });

/** asset 协议地址：前端 <img>/<video> 显示用 */
export const mediaItemSrc = (item: MediaItem): string =>
  convertFileSrc(item.path);

/** 文章内引用地址（随渲染拷贝到 dist/media/） */
export const mediaPublicUrl = (item: MediaItem): string =>
  `/media/${item.filename}`;

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
