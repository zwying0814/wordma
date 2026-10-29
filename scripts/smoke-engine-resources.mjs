#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const stageDir = path.join(
  root,
  'apps/desktop/src-tauri/resources/engine',
);
const cli = path.join(stageDir, 'cli.js');

const hostTriple = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
}[`${process.platform}-${process.arch}`];

function bunBinary() {
  if (process.env.BUN_BIN) return process.env.BUN_BIN;

  const triple = process.env.BUN_TARGET ?? hostTriple;
  const extension = triple?.includes('windows') ? '.exe' : '';
  const sidecar = path.join(
    root,
    'apps/desktop/src-tauri/binaries',
    `bun-${triple}${extension}`,
  );

  return existsSync(sidecar) ? sidecar : 'bun';
}

function engineEnv() {
  return {
    ...process.env,
    WORDMA_ENGINE_ROOT: stageDir,
    WORDMA_DEFAULT_THEME_DIR: path.join(
      stageDir,
      'themes/default',
    ),
    WORDMA_ISLAND_RUNTIME_ENTRY: path.join(
      stageDir,
      'runtime-entry.ts',
    ),
  };
}

function createWorkspace() {
  const workspace = mkdtempSync(
    path.join(tmpdir(), 'wordma-engine-smoke-'),
  );
  mkdirSync(path.join(workspace, 'content/posts'), {
    recursive: true,
  });
  writeFileSync(
    path.join(workspace, 'wordma.site.yaml'),
    [
      'site:',
      '  title: Engine Smoke',
      '  language: zh-CN',
      'theme:',
      '  id: wordma-theme-default',
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(workspace, 'content/posts/hello.mdx'),
    [
      '---',
      'title: Hello Smoke',
      '---',
      '',
      '# Hello Smoke',
      '',
      'Staged engine works.',
      '',
    ].join('\n'),
  );
  return workspace;
}

function run(bun, args) {
  return spawnSync(bun, [cli, ...args], {
    cwd: root,
    env: engineEnv(),
    encoding: 'utf8',
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('无法分配端口'));
        }
      });
    });
  });
}

async function waitForHttp(url, timeoutMs = 10000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server starting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`dev server 未就绪：${url}`);
}

async function devSmoke(bun, workspace) {
  const port = await freePort();
  const child = spawn(
    bun,
    [
      cli,
      'dev',
      '--root',
      workspace,
      '--port',
      String(port),
      '--json',
      '--no-watch',
      '--no-cache',
    ],
    {
      cwd: root,
      env: engineEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForHttp(`http://127.0.0.1:${port}/`);
    if (!output.includes('"type":"ready"')) {
      throw new Error('未收到 engine ready 事件');
    }
  } finally {
    child.kill('SIGINT');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

async function main() {
  if (!existsSync(cli)) {
    throw new Error(
      `缺少 staged engine：${cli}\n先运行 pnpm engine:stage`,
    );
  }

  const bun = bunBinary();
  const workspace = createWorkspace();

  try {
    const inspect = run(bun, [
      'inspect',
      '--root',
      workspace,
      '--json',
    ]);
    if (inspect.status !== 0) {
      throw new Error(
        `staged inspect 失败：\n${inspect.stderr}\n${inspect.stdout}`,
      );
    }
    const inspectResult = JSON.parse(inspect.stdout);
    if (inspectResult.themeId !== 'wordma-theme-default') {
      throw new Error('staged inspect 未解析默认主题');
    }

    const outDir = path.join(workspace, 'dist');
    const build = run(bun, [
      'build',
      '--root',
      workspace,
      '--out',
      outDir,
      '--json',
      '--no-cache',
    ]);
    if (build.status !== 0) {
      throw new Error(
        `staged build 失败：\n${build.stderr}\n${build.stdout}`,
      );
    }
    const index = readFileSync(
      path.join(outDir, 'index.html'),
      'utf8',
    );
    if (!index.includes('Engine Smoke')) {
      throw new Error('staged build 产物缺少站点标题');
    }

    await devSmoke(bun, workspace);

    console.log('✓ staged engine inspect');
    console.log('✓ staged engine build');
    console.log('✓ staged engine dev');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
