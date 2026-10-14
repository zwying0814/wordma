import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { all, get, getDataDir, run } from './db';

export type MediaItem = {
  id: number;
  siteId: number;
  filename: string;
  originalName: string;
  mimeType: string;
  kind: 'image' | 'video';
  size: number;
  path: string;
  createdAt: string;
};

type MediaRow = {
  id: number;
  site_id: number;
  filename: string;
  original_name: string;
  mime_type: string;
  kind: 'image' | 'video';
  size: number;
  path: string;
  created_at: string;
};

const MAX_PATH_UPLOAD_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_DATA_UPLOAD_SIZE = 25 * 1024 * 1024; // base64 兜底通道 25MB

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function extFromName(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : null;
}

function mediaDirFor(siteId: number): string {
  return path.join(getDataDir(), 'media', String(siteId));
}

function toMediaItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    siteId: row.site_id,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    kind: row.kind,
    size: row.size,
    path: row.path,
    createdAt: row.created_at,
  };
}

function toMediaItems(rows: MediaRow[]): MediaItem[] {
  return rows.map(toMediaItem);
}

/** 写入文件 + DB 登记；DB 失败时回滚删除文件 */
function persistMedia(
  siteId: number,
  srcAbsPath: string | null,
  bytes: Buffer | null,
  ext: string,
  mimeType: string,
  kind: 'image' | 'video',
  originalName: string,
  size: number
): MediaItem {
  const dir = mediaDirFor(siteId);
  mkdirSync(dir, { recursive: true });

  const nanos = process.hrtime.bigint() & 0xffffffffn;
  const filename = `${Date.now()}-${nanos.toString(16).padStart(8, '0')}.${ext}`;
  const dest = path.join(dir, filename);

  try {
    if (srcAbsPath) {
      copyFileSync(srcAbsPath, dest);
    } else if (bytes) {
      writeFileSync(dest, bytes);
    } else {
      throw new Error('媒体内容为空');
    }

    const { lastInsertRowid } = run(
      'INSERT INTO media (site_id, filename, original_name, mime_type, kind, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)',
      siteId,
      filename,
      originalName,
      mimeType,
      kind,
      size,
      dest
    );
    return getMedia(lastInsertRowid);
  } catch (err) {
    // 回滚：删除可能已写入的文件
    try {
      if (existsSync(dest)) rmSync(dest);
    } catch {
      /* 忽略清理失败 */
    }
    throw err;
  }
}

/** 路径上传通道：Electron 渲染层经 webUtils 拿到真实文件路径后复制 */
export function uploadMediaFromPath(payload: {
  siteId: number;
  filePath: string;
  originalName?: string;
}): MediaItem {
  const ext = extFromPath(payload.filePath);
  if (!ext || !MIME_BY_EXT[ext]) {
    throw new Error('不支持的文件类型');
  }

  let size = 0;
  try {
    size = statSync(payload.filePath).size;
  } catch {
    throw new Error('无法读取上传的文件');
  }
  if (size > MAX_PATH_UPLOAD_SIZE) {
    throw new Error('文件大小超过 200MB 上限');
  }

  const kind = IMAGE_EXTS.has(ext) ? 'image' : 'video';
  const originalName = payload.originalName ?? path.basename(payload.filePath);

  return persistMedia(
    payload.siteId,
    payload.filePath,
    null,
    ext,
    MIME_BY_EXT[ext],
    kind,
    originalName,
    size
  );
}

/** base64 兜底通道（剪贴板粘贴等无路径场景），上限 25MB */
export function uploadMediaData(payload: {
  siteId: number;
  base64: string;
  originalName: string;
}): MediaItem {
  const ext = extFromName(payload.originalName);
  if (!ext || !MIME_BY_EXT[ext]) {
    throw new Error('不支持的文件类型');
  }

  const bytes = Buffer.from(payload.base64, 'base64');
  if (bytes.length === 0) throw new Error('文件内容为空');
  if (bytes.length > MAX_DATA_UPLOAD_SIZE) {
    throw new Error('该通道仅支持 25MB 以内的文件，请从本地文件上传');
  }

  const kind = IMAGE_EXTS.has(ext) ? 'image' : 'video';

  return persistMedia(
    payload.siteId,
    null,
    bytes,
    ext,
    MIME_BY_EXT[ext],
    kind,
    payload.originalName,
    bytes.length
  );
}

export function listMedia(siteId: number): MediaItem[] {
  return toMediaItems(
    all<MediaRow>('SELECT * FROM media WHERE site_id = ? ORDER BY created_at DESC, id DESC', siteId)
  );
}

export function getMedia(id: number): MediaItem {
  const row = get<MediaRow>('SELECT * FROM media WHERE id = ?', id);
  if (!row) throw new Error('媒体不存在');
  return toMediaItem(row);
}

/** 删除媒体：DB 行 + 磁盘文件 */
export function deleteMedia(id: number): void {
  const row = get<MediaRow>('SELECT * FROM media WHERE id = ?', id);
  if (!row) throw new Error('媒体不存在');

  run('DELETE FROM media WHERE id = ?', id);
  try {
    if (existsSync(row.path)) rmSync(row.path);
  } catch (err) {
    console.error('删除媒体文件失败:', err);
  }
}

function extFromPath(filePath: string): string | null {
  return extFromName(path.basename(filePath));
}
