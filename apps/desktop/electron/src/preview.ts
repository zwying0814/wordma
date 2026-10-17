import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { getSetting } from './settings';

let previewDir: string | null = null;
let server: http.Server | null = null;
let serverPort: number | null = null;

const DEFAULT_PORT = 12739;
const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  xml: 'application/xml; charset=utf-8',
  json: 'application/json; charset=utf-8',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
};

export const MIN_PORT = 1024;
export const MAX_PORT = 65535;

/** 预览端口：WORDMA_PREVIEW_PORT（E2E/CI）> settings > 默认 12739 */
export function getPreviewPort(): number {
  const env = process.env.WORDMA_PREVIEW_PORT;
  if (env) return Number(env);
  const raw = getSetting('preview_port');
  return raw ? Number(raw) : DEFAULT_PORT;
}

/** 指向要服务的目录（重渲染后切换，无需重启服务器） */
export function setPreviewDir(dir: string): void {
  previewDir = dir;
}

export function isPreviewRunning(): boolean {
  return server !== null;
}

export function getRunningPort(): number | null {
  return serverPort;
}

/** 启动（或切换端口重启）预览服务器。返回实际端口。 */
export function startPreviewServer(port: number): Promise<number> {
  if (server) {
    if (serverPort === port) return Promise.resolve(port);
    stopPreviewServer();
  }

  return new Promise((resolve, reject) => {
    const candidate = http.createServer(handleRequest);
    candidate.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${port} 已被占用，请在设置中更换预览端口`));
      } else {
        reject(new Error(`预览服务器启动失败：${err.message}`));
      }
    });
    candidate.listen(port, '127.0.0.1', () => {
      server = candidate;
      serverPort = port;
      resolve(port);
    });
  });
}

export function stopPreviewServer(): void {
  server?.close();
  server = null;
  serverPort = null;
}

/** 丢弃当前服务目录（数据目录被清空后调用，避免继续指向已删除的路径） */
export function clearPreviewDir(): void {
  previewDir = null;
}

export function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`预览端口须在 ${MIN_PORT}-${MAX_PORT} 之间`);
  }
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const dir = previewDir;
  if (!dir) {
    res.writeHead(500);
    res.end('preview dir not set');
    return;
  }

  try {
    // 解码 + 防路径穿越（对齐 Rust 版的 rel.contains("..") 检查）
    const raw = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (raw.includes('..')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    let relative = raw.replace(/^\//, '');
    if (relative === '' || relative.endsWith('/')) relative += 'index.html';

    const filePath = path.resolve(dir, relative);
    if (!filePath.startsWith(path.resolve(dir))) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME_BY_EXT[ext] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end(`preview error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
