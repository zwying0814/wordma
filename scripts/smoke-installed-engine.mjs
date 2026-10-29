#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
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
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const WORDMA_ENV_KEYS = [
  'WORDMA_ENGINE_ROOT',
  'WORDMA_DEFAULT_THEME_DIR',
  'WORDMA_ISLAND_RUNTIME_ENTRY',
];

export function resolveInstalledLayout({
  app,
  engineDir,
  bun,
}) {
  if (app) {
    return {
      engine: path.join(
        app,
        'Contents/Resources/engine',
      ),
      bun: path.join(app, 'Contents/MacOS/bun'),
    };
  }

  if (!engineDir || !bun) {
    throw new Error(
      '需要 --app，或同时提供 --engine-dir 与 --bun',
    );
  }

  return { engine: engineDir, bun };
}

export function requiredInstalledResources(engineDir) {
  return [
    path.join(engineDir, 'cli.js'),
    path.join(engineDir, 'runtime-entry.ts'),
    path.join(engineDir, 'themes/default/theme.yaml'),
    path.join(engineDir, 'node_modules'),
  ];
}

export function missingInstalledResources(layout) {
  return [
    ...requiredInstalledResources(layout.engine),
    layout.bun,
  ].filter((filePath) => !existsSync(filePath));
}

export function engineEnvironment(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of WORDMA_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

export function createSmokeWorkspace(directory, title) {
  mkdirSync(path.join(directory, 'content/posts'), {
    recursive: true,
  });
  writeFileSync(
    path.join(directory, 'wordma.site.yaml'),
    [
      'site:',
      `  title: ${title}`,
      '  language: zh-CN',
      'theme:',
      '  id: wordma-theme-default',
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(directory, 'content/posts/hello.mdx'),
    [
      '---',
      'title: Installed Hello',
      '---',
      '',
      '# Installed Hello',
      '',
      'Packaged engine works outside the repository.',
      '',
    ].join('\n'),
  );
  return directory;
}

function run(bun, cli, args, cwd, env) {
  return spawnSync(bun, [cli, ...args], {
    cwd,
    env,
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

async function waitForHttp(url, timeoutMs = 15000) {
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

async function waitForPortClosed(url, timeoutMs = 5000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(url);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`dev server 仍在监听：${url}`);
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };

    child.once('exit', finish);
    timer = setTimeout(finish, timeoutMs);
  });
}

function processGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function killDevServer(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', [
      '/PID',
      String(child.pid),
      '/T',
      '/F',
    ]);
    await waitForExit(child, 5000);
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await waitForExit(child, 3000);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    await waitForExit(child, 3000);
  }
}

async function smokeDevServer(bun, cli, workspace, cwd, env) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
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
      cwd,
      env,
      detached: process.platform !== 'win32',
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
    await waitForHttp(url);
    if (!output.includes('"type":"ready"')) {
      throw new Error('未收到 engine ready 事件');
    }
  } finally {
    await killDevServer(child);
  }

  if (child.exitCode === null) {
    throw new Error('engine dev 进程未退出');
  }

  await waitForPortClosed(url);

  if (
    process.platform !== 'win32' &&
    processGroupAlive(child.pid)
  ) {
    throw new Error('engine dev 进程组仍有残留进程');
  }
}

function usage() {
  return [
    'Usage: node scripts/smoke-installed-engine.mjs [options]',
    '',
    'Options:',
    '  --app <Wordma.app>       macOS app bundle',
    '  --engine-dir <dir>       Installed engine resources',
    '  --bun <path>             Installed Bun sidecar',
    '  --help                   Show this message',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    app: null,
    engineDir: null,
    bun: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    switch (value) {
      case '--app':
        options.app = next;
        index += 1;
        break;
      case '--engine-dir':
        options.engineDir = next;
        index += 1;
        break;
      case '--bun':
        options.bun = next;
        index += 1;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`未知参数: ${value}`);
    }
  }

  return options;
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  let layout;
  try {
    options.app = options.app
      ? path.resolve(options.app)
      : null;
    options.engineDir = options.engineDir
      ? path.resolve(options.engineDir)
      : null;
    options.bun = options.bun
      ? path.resolve(options.bun)
      : null;
    layout = resolveInstalledLayout(options);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const missing = missingInstalledResources(layout);
  if (missing.length > 0) {
    for (const filePath of missing) {
      console.error(`缺少安装资源: ${filePath}`);
    }
    process.exit(1);
  }

  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-installed-smoke-'),
  );
  const isolatedRoot = path.join(root, 'app');
  const engine = path.join(isolatedRoot, 'engine');
  const workspace = path.join(root, 'workspace');
  const env = {
    ...engineEnvironment(),
    WORDMA_ENGINE_ROOT: engine,
    WORDMA_DEFAULT_THEME_DIR: path.join(
      engine,
      'themes/default',
    ),
    WORDMA_ISLAND_RUNTIME_ENTRY: path.join(
      engine,
      'runtime-entry.ts',
    ),
  };

  try {
    cpSync(layout.engine, engine, { recursive: true });
    createSmokeWorkspace(workspace, 'Installed Smoke');

    const cli = path.join(engine, 'cli.js');
    const inspect = run(
      layout.bun,
      cli,
      ['inspect', '--root', workspace, '--json'],
      root,
      env,
    );
    if (inspect.status !== 0) {
      throw new Error(
        `installed inspect 失败：\n${inspect.stderr}\n${inspect.stdout}`,
      );
    }
    if (JSON.parse(inspect.stdout).themeId !== 'wordma-theme-default') {
      throw new Error('installed inspect 未解析默认主题');
    }

    const outDir = path.join(root, 'dist output');
    const build = run(
      layout.bun,
      cli,
      [
        'build',
        '--root',
        workspace,
        '--out',
        outDir,
        '--json',
        '--no-cache',
      ],
      root,
      env,
    );
    if (build.status !== 0) {
      throw new Error(
        `installed build 失败：\n${build.stderr}\n${build.stdout}`,
      );
    }

    const html = readFileSync(
      path.join(outDir, 'index.html'),
      'utf8',
    );
    if (
      !html.includes('Installed Smoke') ||
      !/assets\/css\/theme-[a-f0-9]+\.css/.test(html)
    ) {
      throw new Error('installed build 产物缺少内容或主题样式');
    }

    await smokeDevServer(
      layout.bun,
      cli,
      workspace,
      root,
      env,
    );

    console.log('✓ installed engine inspect');
    console.log('✓ installed engine build');
    console.log('✓ installed engine dev');
    console.log('✓ dev process group exited');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
