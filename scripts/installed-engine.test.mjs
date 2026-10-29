import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createSmokeWorkspace,
  engineEnvironment,
  missingInstalledResources,
  requiredInstalledResources,
  resolveInstalledLayout,
} from './smoke-installed-engine.mjs';

test('解析 macOS app 与通用安装目录', () => {
  assert.deepEqual(
    resolveInstalledLayout({
      app: '/Applications/Wordma.app',
    }),
    {
      engine:
        '/Applications/Wordma.app/Contents/Resources/engine',
      bun: '/Applications/Wordma.app/Contents/MacOS/bun',
    },
  );

  assert.deepEqual(
    resolveInstalledLayout({
      engineDir: '/opt/Wordma/engine',
      bun: '/opt/Wordma/bun',
    }),
    {
      engine: '/opt/Wordma/engine',
      bun: '/opt/Wordma/bun',
    },
  );

  assert.throws(
    () => resolveInstalledLayout({ engineDir: '/opt/Wordma' }),
    /--app/,
  );
});

test('清除继承的 WORDMA 资源路径', () => {
  const env = engineEnvironment({
    PATH: '/usr/bin',
    WORDMA_ENGINE_ROOT: '/repo/packages/engine',
    WORDMA_DEFAULT_THEME_DIR: '/repo/themes/default',
    WORDMA_ISLAND_RUNTIME_ENTRY: '/repo/runtime-entry.ts',
  });

  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.WORDMA_ENGINE_ROOT, undefined);
  assert.equal(env.WORDMA_DEFAULT_THEME_DIR, undefined);
  assert.equal(env.WORDMA_ISLAND_RUNTIME_ENTRY, undefined);
});

test('生成最小站点并检查安装资源完整性', () => {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-installed-'),
  );
  const engine = path.join(root, 'engine');
  const workspace = path.join(root, 'workspace');

  try {
    mkdirSync(engine, { recursive: true });
    assert.equal(
      missingInstalledResources({
        engine,
        bun: path.join(root, 'bun'),
      }).length,
      requiredInstalledResources(engine).length + 1,
    );

    for (const filePath of requiredInstalledResources(engine)) {
      if (filePath.endsWith('node_modules')) {
        mkdirSync(filePath, { recursive: true });
      } else {
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, '');
      }
    }
    const bun = path.join(root, 'bun');
    writeFileSync(bun, '');

    assert.deepEqual(
      missingInstalledResources({ engine, bun }),
      [],
    );

    createSmokeWorkspace(workspace, 'Installed Test');

    assert.match(
      readFileSync(
        path.join(workspace, 'wordma.site.yaml'),
        'utf8',
      ),
      /title: Installed Test/,
    );
    assert.match(
      readFileSync(
        path.join(workspace, 'content/posts/hello.mdx'),
        'utf8',
      ),
      /# Installed Hello/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
