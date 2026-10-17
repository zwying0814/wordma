import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 每个 Playwright worker 复用一个 Electron 进程。
 *
 * 以前每个用例都 `electron.launch` 一次（约 0.6~0.7s），是套件耗时的大头。
 * 现在进程在 worker 内启动一次，用例之间通过「清空数据目录 + 重挂载渲染层」
 * 回到干净状态（`debug_reset_data` 通道，主进程侧见 electron/src/ipc-register.ts）。
 */

type Session = {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  /** 无 hash 的入口 URL（首屏加载完成后才可靠） */
  baseUrl: string;
};

let session: Session | null = null;
/** 共享数据目录按 worker 隔离，避免多 worker 时互相清库 */
let sharedDataDir: string | null = null;

export function getSharedDataDir(): string {
  if (!sharedDataDir) {
    const tag = process.env.TEST_WORKER_INDEX ?? String(process.pid);
    sharedDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `wordma-e2e-shared-${tag}-`)
    );
  }
  return sharedDataDir;
}

/** 关闭当前进程（真正的 app.close()，与测试里那个空操作的 close 不同） */
export async function killSession(): Promise<void> {
  const dying = session;
  session = null;
  if (!dying) return;
  try {
    await dying.app.close();
  } catch {
    /* 进程可能已经退出 */
  }
}

/** 启动一个 Electron 并接管为当前会话 */
export async function startSession(dataDir: string): Promise<Session> {
  await killSession();

  const app = await electron.launch({
    args: ['electron/main.mjs'],
    env: { ...process.env, WORDMA_DATA_DIR: dataDir, WORDMA_E2E: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean((window as any).api));
  // 首屏加载完成后 url 才稳定（早于 loadFile 时可能是 about:blank）
  const baseUrl = page.url().split('#')[0];

  session = { app, page, dataDir, baseUrl };
  return session;
}

/** 确保会话跑在指定数据目录上（目录不同则真重启） */
export async function ensureSession(dataDir: string): Promise<Session> {
  if (session && session.dataDir === dataDir) return session;
  return startSession(dataDir);
}

/** 清空数据目录（主进程侧同步完成：停预览 → 关库 → 删目录 → 重建 → 提取内置主题） */
export async function wipeState(): Promise<void> {
  if (!session) throw new Error('会话尚未启动');
  try {
    await session.page.evaluate(() =>
      (window as any).api.invoke('debug_reset_data')
    );
  } catch (err) {
    throw new Error(
      `重置数据目录失败（${err instanceof Error ? err.message : String(err)}）。` +
        '该通道由主进程提供，改过 electron/src 后请先 `pnpm build:main` 重新打包。'
    );
  }
}

/**
 * 重挂载渲染层：先清 hash 再 reload。
 * 不能用 `page.goto(baseUrl)` —— 只改 fragment 属于同文档导航，React 不会重新挂载，
 * SiteContext 的 activeSite、编辑器内容都会残留上一个用例的状态。
 */
export async function remount(): Promise<void> {
  if (!session) throw new Error('会话尚未启动');
  await session.page.evaluate(() =>
    window.history.replaceState(null, '', window.location.pathname)
  );
  await session.page.reload();
  await session.page.waitForFunction(() => Boolean((window as any).api));
}

/** worker 退出时收尾：关进程 + 删共享数据目录（由 fixtures 的 worker fixture 调用） */
export async function disposeSession(): Promise<void> {
  await killSession();
  if (sharedDataDir) {
    try {
      fs.rmSync(sharedDataDir, { recursive: true, force: true });
    } catch {
      /* 目录可能已不存在 */
    }
    sharedDataDir = null;
  }
}

/** worker 被强杀（超时/中断）时兜底：同步杀子进程并清理目录 */
function cleanupSync(): void {
  const pid = session?.app.process()?.pid;
  if (pid) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* 已退出 */
    }
  }
  if (sharedDataDir) {
    try {
      fs.rmSync(sharedDataDir, { recursive: true, force: true });
    } catch {
      /* 目录可能已不存在 */
    }
  }
}

process.once('exit', cleanupSync);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    cleanupSync();
    process.exit(0);
  });
}
