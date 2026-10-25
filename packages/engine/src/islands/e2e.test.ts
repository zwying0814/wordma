import { describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildSite } from '../build';

const repoRoot = path.resolve(
  import.meta.dirname,
  '../../../..',
);

function bareToRuntime(
  source: string,
  runtimeUrl: string,
): string {
  return source.replace(
    /from\s*['"](react(?:-dom)?(?:\/[^'"]*)?)['"]/g,
    `from ${JSON.stringify(runtimeUrl)}`,
  );
}

async function waitFor(
  predicate: () => boolean,
  timeout = 3000,
): Promise<void> {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > timeout) {
      throw new Error('E2E 等待超时');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('岛屿 DOM E2E', () => {
  it('Counter 可点击、Note children 可见、无控制台错误', async () => {
    const root = path.join(repoRoot, 'fixtures/islands');
    const outDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-e2e-'),
    );
    const modulesDir = mkdtempSync(
      path.join(tmpdir(), 'wordma-e2e-modules-'),
    );
    const errors: unknown[][] = [];
    const originalError = console.error;

    try {
      await buildSite({ root, outDir });

      const assetDir = path.join(outDir, 'assets/islands');
      const assets = readdirSync(assetDir);
      const reactFile = assets.find((file) =>
        file.startsWith('react-'),
      );
      const mountFile = assets.find((file) =>
        file.startsWith('mount-'),
      );
      if (!reactFile || !mountFile) {
        throw new Error('缺少运行时或挂载脚本');
      }

      const runtimeUrl = pathToFileURL(
        path.join(assetDir, reactFile),
      ).href;
      const jsFiles = assets.filter(
        (file) =>
          file.startsWith('island-') &&
          file.endsWith('.js'),
      );

      expect(jsFiles).toHaveLength(2);

      for (const file of jsFiles) {
        const transformed = bareToRuntime(
          readFileSync(path.join(assetDir, file), 'utf8'),
          runtimeUrl,
        );
        writeFileSync(
          path.join(modulesDir, file),
          transformed,
        );
      }

      let html = readFileSync(
        path.join(outDir, 'posts/islands/index.html'),
        'utf8',
      );
      for (const file of jsFiles) {
        html = html.replaceAll(
          `/assets/islands/${file}`,
          pathToFileURL(path.join(modulesDir, file)).href,
        );
      }

      const article = /<article class="prose">[\s\S]*?<\/article>/.exec(
        html,
      )?.[0];
      if (!article) throw new Error('缺少文章正文');

      const mountSource = bareToRuntime(
        readFileSync(path.join(assetDir, mountFile), 'utf8'),
        runtimeUrl,
      );
      const mountPath = path.join(modulesDir, 'mount.mjs');
      writeFileSync(mountPath, mountSource);

      GlobalRegistrator.register({
        url: 'http://localhost/',
      });
      console.error = (...args: unknown[]) => {
        errors.push(args);
      };

      document.body.innerHTML = article;
      await import(
        `${pathToFileURL(mountPath).href}?v=${Date.now()}`
      );

      await waitFor(
        () =>
          document.querySelectorAll('button').length === 2 &&
          document.querySelector('aside.wordma-note') !== null,
      );

      const buttons = [
        ...document.querySelectorAll('button'),
      ];
      expect(
        buttons.map((button) => button.textContent),
      ).toEqual(['Count: 2', 'Count: 0']);
      expect(
        document.querySelector('aside.wordma-note')
          ?.textContent,
      ).toContain('This content is rendered inside a Note island.');

      buttons[0]?.click();
      await waitFor(
        () => buttons[0]?.textContent === 'Count: 3',
      );

      expect(buttons[0]?.textContent).toBe('Count: 3');
      expect(errors).toEqual([]);
    } finally {
      console.error = originalError;
      if (existsSync(modulesDir)) {
        rmSync(modulesDir, { recursive: true, force: true });
      }
      rmSync(outDir, { recursive: true, force: true });
      rmSync(path.join(root, '.wordma'), {
        recursive: true,
        force: true,
      });
      if (GlobalRegistrator.isRegistered) {
        await GlobalRegistrator.unregister();
      }
    }
  });
});
