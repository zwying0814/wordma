import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, initDataDir } from './db';
import { registerAllIpc } from './ipc-register';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 开发模式下由脚本注入，指向 Vite dev server
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

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

app.on('window-all-closed', () => {
  // macOS 惯例：关闭窗口不退出应用
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  closeDb();
});
