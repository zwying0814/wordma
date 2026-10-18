import { app, BrowserWindow, dialog, protocol } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

import { closeDb, getDataDir, openSiteDb } from './db';
import { MIME_BY_EXT } from './media';
import { registerAllIpc } from './ipc-register';
import { ensureBuiltinThemes } from './theme';
import { getActiveSite, setRegistryRoot } from './site';

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

/** 应用私有根（registry.json 所在）：WORDMA_DATA_DIR 覆盖（E2E/CI 隔离用），默认 userData */
function resolveAppRoot(): string {
  return (
    process.env.WORDMA_DATA_DIR ||
    app.getPath('userData')
  );
}

/** 激活站点存在则打开其库（含建表迁移）+ 提取内置主题；无站点则保持 Welcome 状态 */
function ensureActiveSiteDb(): void {
  const site = getActiveSite();
  if (!site) return;
  openSiteDb(site.dir);
  ensureBuiltinThemes();
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
    // 站点目录模型：启动只读 registry；有激活站点才打开其目录下的库
    setRegistryRoot(resolveAppRoot());
    ensureActiveSiteDb();
    registerAllIpc();
    registerMediaProtocol();
  } catch (err) {
    dialog.showErrorBox(
      '初始化失败',
      `数据初始化失败：\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
    return;
  }

  createWindow();

  if (process.env.WORDMA_E2E === '1') {
    watchParentProcess();
  }

  app.on('activate', () => {
    // macOS 上点击 Dock 图标时若无窗口则重建
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * E2E 专用看门狗：测试 runner 强杀 worker 时父进程会消失，
 * 此时退出，避免残留 Electron 进程继续占用数据库与预览端口。
 * 仅在 WORDMA_E2E=1 下启用，生产启动路径行为不变。
 */
function watchParentProcess(): void {
  const parentPid = process.ppid;
  setInterval(() => {
    if (process.ppid !== parentPid) app.quit();
  }, 1000).unref();
}

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
    // 站点目录下的扁平媒体目录；URL 形如 wordma-media://media/{siteId}/{filename}，
    // siteId 段仅为兼容内容里已存的引用形式，落盘忽略它
    // （host 必须是字母段：纯数字 host 会被 Chromium 当 IPv4 解析毁掉，所以 siteId 走 pathname）
    const parts = url.pathname.split('/').filter(Boolean);
    const filename = parts[1] ?? '';

    // 防路径穿越：文件名形如 {millis}-{nanos}.{ext}，禁止 .. 与子目录
    if (
      !/^[0-9a-f]+-[0-9a-f]+\.[a-z0-9]+$/i.test(filename) ||
      filename.includes('..')
    ) {
      return new Response('Bad Request', { status: 400 });
    }

    const filePath = path.join(getDataDir(), 'media', filename);
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
