import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildIslandRuntime,
  copyIslandRuntime,
} from './runtime';

describe('buildIslandRuntime', () => {
  it('生成 React 运行时、importmap 与 mount 脚本', async () => {
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-runtime-'),
    );

    try {
      const runtime = await buildIslandRuntime({
        cacheDir,
        basePath: '/docs/',
      });

      expect(runtime.react.url).toStartWith(
        '/docs/assets/islands/react-',
      );
      expect(runtime.mount.url).toStartWith(
        '/docs/assets/islands/mount-',
      );
      expect(runtime.react.bytes).toBeGreaterThan(1000);
      expect(runtime.mount.bytes).toBeGreaterThan(100);
      expect(existsSync(runtime.react.filePath)).toBe(true);
      expect(existsSync(runtime.mount.filePath)).toBe(true);

      expect(runtime.importMap).toEqual({
        react: runtime.react.url,
        'react/jsx-runtime': runtime.react.url,
        'react/jsx-dev-runtime': runtime.react.url,
        'react-dom': runtime.react.url,
        'react-dom/client': runtime.react.url,
      });

      const reactText = readFileSync(
        runtime.react.filePath,
        'utf8',
      );
      expect(reactText).toContain('createElement');
      expect(reactText).toContain('createRoot');
      expect(reactText).toContain('jsx');
      expect(reactText).not.toContain('from"react"');

      const mountText = readFileSync(
        runtime.mount.filePath,
        'utf8',
      );
      expect(mountText).toContain(
        "querySelectorAll(\n  '[data-wordma-island]'",
      );
      expect(mountText).toContain('data-wordma-props');
      expect(mountText).toContain('data-wordma-slot');
      expect(mountText).toContain(
        'data-wordma-island-error',
      );
      expect(mountText).toContain("from 'react-dom/client'");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('导出的运行时 API 可用', async () => {
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-runtime-'),
    );

    try {
      const runtime = await buildIslandRuntime({ cacheDir });
      const module = (await import(
        `${pathToFileURL(runtime.react.filePath).href}?v=${Date.now()}`
      )) as Record<string, unknown>;

      expect(typeof module.createElement).toBe('function');
      expect(typeof module.createRoot).toBe('function');
      expect(typeof module.jsx).toBe('function');
      expect(typeof module.useState).toBe('function');
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('重复构建保持文件名稳定', async () => {
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-runtime-'),
    );

    try {
      const first = await buildIslandRuntime({ cacheDir });
      const second = await buildIslandRuntime({ cacheDir });

      expect(second.react.url).toBe(first.react.url);
      expect(second.mount.url).toBe(first.mount.url);
      expect(
        readdirSync(cacheDir).filter((file) =>
          file.endsWith('.js'),
        ),
      ).toHaveLength(2);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it('复制运行时到 dist', async () => {
    const cacheDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-runtime-'),
    );
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-runtime-out-'),
    );

    try {
      const runtime = await buildIslandRuntime({ cacheDir });
      copyIslandRuntime(outDir, runtime);

      for (const asset of [runtime.react, runtime.mount]) {
        expect(
          existsSync(
            path.join(
              outDir,
              'assets/islands',
              path.basename(asset.filePath),
            ),
          ),
        ).toBe(true);
      }
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
