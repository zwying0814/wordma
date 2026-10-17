import { test as base } from '@playwright/test';

import { disposeSession } from './session';

/**
 * 套件共用的 test：加一个 worker 作用域的自动 fixture，负责在 worker 结束时
 * 真正关掉复用的 Electron 进程（否则子进程会让 worker 事件循环一直挂着、
 * Playwright 只能等超时后强杀），并清理共享数据目录。
 *
 * spec 只把 `import { expect, test } from '@playwright/test'` 换成本模块即可，
 * 用例签名与断言不受影响。
 */
export const test = base.extend<Record<string, never>, { appLifecycle: void }>({
  appLifecycle: [
    async ({}, use) => {
      await use();
      await disposeSession();
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect } from '@playwright/test';
export type { ElectronApplication, Page } from '@playwright/test';
