import { app, BrowserWindow, dialog, protocol } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

import { closeDb, getDataDir, initDataDir } from './db';
import { MIME_BY_EXT } from './media';
import { registerAllIpc } from './ipc-register';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 开发模式下由脚本注入，指向 Vite dev server
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// 必须在 app ready 前注册（媒体展示走 wordma-media://{siteId}/{filename}）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'wordma-media',
    privileges: {
      standard: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

/** 数据目录：WORDMA_DATA_DIR 覆盖（E2E/CI 隔离用），默认 userData/wordma */
function resolveDataDir(): string {
  return (
    process.env.WORDMA_DATA_DIR ||
    path.join(app.getPath('userData'), 'wordma')
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'Wordma',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  loadWindow(win);
}

function loadWindow(win: BrowserWindow): void {
  if (VITE_DEV_SERVER_URL) {
    // 开发模式：Vite 尚未就绪时会连接失败，1 秒后自动重试直到成功
    win.loadURL(VITE_DEV_SERVER_URL).catch((err) => {
      if (win.isDestroyed()) return;
      console.error('等待 Vite dev server 就绪:', err.message);
      setTimeout(() => {
        if (!win.isDestroyed()) loadWindow(win);
      }, 1000);
    });
  } else {
    // 产物模式：dist 可能正在被重新构建（或尚未构建），最多重试 3 次
    const distIndex = path.join(__dirname, '../dist/index.html');
    let attempts = 0;

    const attemptLoad = (): void => {
      attempts += 1;
      win
        .loadFile(distIndex)
        .catch((err) => {
          if (win.isDestroyed()) return;
          if (attempts < 3) {
            console.error(`加载应用页面失败（第 ${attempts} 次），1 秒后重试:`, err.message);
            setTimeout(attemptLoad, 1000);
            return;
          }
          dialog.showErrorBox(
            '加载失败',
            `无法加载应用页面（已重试 ${attempts} 次）：\n${err.message}\n\n` +
              '请先构建渲染层产物：pnpm --filter desktop run build\n' +
              '或使用开发模式：根目录运行 pnpm dev'
          );
        });
    };

    attemptLoad();
  }
}

app.whenReady().then(() => {
  try {
    initDataDir(resolveDataDir());
    registerAllIpc();
    registerMediaProtocol();
  } catch (err) {
    dialog.showErrorBox(
      '初始化失败',
      `数据库初始化失败：\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    // macOS 上点击 Dock 图标时若无窗口则重建
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/** 媒体协议：wordma-media://{siteId}/{filename} → 数据目录内文件 */
function registerMediaProtocol(): void {
  protocol.handle('wordma-media', (request) => {
    try {
      return handleMediaRequest(request);
    } catch (err) {
      return new Response(
        `handler error: ${err instanceof Error ? err.message : String(err)}`,
        { status: 500 }
      );
    }
  });
}

function handleMediaRequest(request: Request): Response {
  {
    const url = new URL(request.url);
    // URL 形如 wordma-media://media/{siteId}/{filename}
    // （host 必须是字母段：纯数字段会被 Chromium 当 IPv4 解析毁掉）
    const parts = url.pathname.split('/').filter(Boolean);
    const siteId = parts[0] ?? '';
    const filename = parts[1] ?? '';

    // 防路径穿越：文件名形如 {millis}-{nanos}.{ext}，禁止 .. 与子目录
    if (
      !siteId ||
      !/^[0-9a-f]+-[0-9a-f]+\.[a-z0-9]+$/i.test(filename) ||
      filename.includes('..')
    ) {
      return new Response('Bad Request', { status: 400 });
    }

    const filePath = path.join(getDataDir(), 'media', siteId, filename);
    if (!filePath.startsWith(path.join(getDataDir(), 'media'))) {
      return new Response('Bad Request', { status: 400 });
    }

    if (!existsSync(filePath)) {
      return new Response(
        `Not Found: url=${request.url} host=${url.host} pathname=${url.pathname} file=${filePath}`,
        { status: 404 }
      );
    }

    const mime =
      MIME_BY_EXT[path.extname(filename).slice(1).toLowerCase()] ??
      'application/octet-stream';
    const size = statSync(filePath).size;

    // 基础 Range 支持（视频拖动播放）
    const range = request.headers.get('range');
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : size - 1;
      const stream = Readable.toWeb(
        createReadStream(filePath, { start, end })
      ) as unknown as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          'content-type': mime,
          'content-length': String(end - start + 1),
          'content-range': `bytes ${start}-${end}/${size}`,
          'accept-ranges': 'bytes',
        },
      });
    }

    const stream = Readable.toWeb(
      createReadStream(filePath)
    ) as unknown as ReadableStream;
    return new Response(stream, {
      headers: {
        'content-type': mime,
        'content-length': String(size),
        'accept-ranges': 'bytes',
      },
    });
  }
}

app.on('window-all-closed', () => {
  // macOS 惯例：关闭窗口不退出应用
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  closeDb();
});
