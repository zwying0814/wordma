import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { startWatch } from './watch';

function makeRoot(prefix = 'wordma-watch-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeFile(
  root: string,
  relativePath: string,
  source = 'x',
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('等待 watch 回调超时');
    }
    await sleep(20);
  }
}

describe('startWatch', () => {
  it('连续写入合并为一次变更', async () => {
    const root = makeRoot();
    const calls: string[][] = [];
    const watcher = startWatch({
      root,
      debounceMs: 120,
      maxWaitMs: 500,
      onChange: (changed) => {
        calls.push(changed);
      },
    });

    try {
      writeFile(root, 'content/a.mdx', 'a');
      writeFile(root, 'content/b.mdx', 'b');
      writeFile(root, 'content/c.mdx', 'c');

      await waitFor(() => calls.length > 0);
      await sleep(250);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual([
        'content/a.mdx',
        'content/b.mdx',
        'content/c.mdx',
      ]);
    } finally {
      watcher.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('忽略 .wordma、node_modules 与临时文件', async () => {
    const root = makeRoot();
    const calls: string[][] = [];
    const watcher = startWatch({
      root,
      ignoredPaths: [path.join(root, 'dist')],
      debounceMs: 80,
      onChange: (changed) => {
        calls.push(changed);
      },
    });

    try {
      writeFile(root, '.wordma/cache/a.json');
      writeFile(root, 'node_modules/pkg/index.js');
      writeFile(root, 'content/a.swp');
      writeFile(root, 'content/b.tmp');
      writeFile(root, 'dist/index.html');

      await sleep(350);
      expect(calls).toEqual([]);
    } finally {
      watcher.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('连续变化超过 maxWait 时强制 flush', async () => {
    const root = makeRoot();
    const calls: string[][] = [];
    const watcher = startWatch({
      root,
      debounceMs: 120,
      maxWaitMs: 200,
      onChange: (changed) => {
        calls.push(changed);
      },
    });

    try {
      for (let index = 0; index < 8; index += 1) {
        writeFile(root, 'content/a.mdx', String(index));
        await sleep(60);
      }

      await waitFor(() => calls.length >= 2);

      expect(calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      watcher.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('监听外部目录并返回绝对路径', async () => {
    const root = makeRoot();
    const external = makeRoot('wordma-watch-theme-');
    const calls: string[][] = [];
    const watcher = startWatch({
      root,
      additionalRoots: [external],
      debounceMs: 80,
      onChange: (changed) => {
        calls.push(changed);
      },
    });

    try {
      writeFile(external, 'src/styles/a.css');

      await waitFor(() => calls.length > 0);
      expect(calls[0]?.some((item) =>
        item.endsWith('src/styles/a.css'),
      )).toBe(true);
      expect(
        path.isAbsolute(calls[0]?.[0] ?? ''),
      ).toBe(true);
    } finally {
      watcher.close();
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('close 后不再触发', async () => {
    const root = makeRoot();
    const calls: string[][] = [];
    const watcher = startWatch({
      root,
      debounceMs: 60,
      onChange: (changed) => {
        calls.push(changed);
      },
    });

    watcher.close();
    writeFile(root, 'content/late.mdx');
    await sleep(250);

    expect(calls).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
