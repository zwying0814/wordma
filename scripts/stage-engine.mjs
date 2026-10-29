#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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

const hostTriple = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
}[`${process.platform}-${process.arch}`];

function targetTriple() {
  const index = process.argv.indexOf('--target');
  if (index !== -1) return process.argv[index + 1];

  const inline = process.argv.find((arg) =>
    arg.startsWith('--target='),
  );
  if (inline) return inline.slice('--target='.length);

  return process.env.BUN_TARGET ?? hostTriple;
}

function bunBinary(triple) {
  if (process.env.BUN_BIN) {
    return process.env.BUN_BIN;
  }

  const extension = triple?.includes('windows') ? '.exe' : '';
  const sidecar = path.join(
    root,
    'apps/desktop/src-tauri/binaries',
    `bun-${triple}${extension}`,
  );

  if (existsSync(sidecar)) return sidecar;

  return 'bun';
}

function bunTargetFlags(triple) {
  if (!triple) return [];

  if (triple.includes('apple-darwin')) {
    return [
      '--os=darwin',
      `--cpu=${triple.startsWith('aarch64') ? 'arm64' : 'x64'}`,
    ];
  }

  if (triple.includes('linux')) {
    return [
      '--os=linux',
      `--cpu=${triple.startsWith('aarch64') ? 'arm64' : 'x64'}`,
      '--libc=glibc',
    ];
  }

  if (triple.includes('windows')) {
    return ['--os=windows', '--cpu=x64'];
  }

  return [];
}

function copyFilter(source) {
  const parts = source.split(path.sep);
  if (parts.includes('node_modules')) return false;
  if (/\.test\.(?:ts|tsx)$/.test(source)) return false;
  return true;
}

function copyDirectory(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: copyFilter,
  });
}

function packageVersion(name) {
  const file = path.join(
    root,
    'node_modules',
    name,
    'package.json',
  );

  try {
    return JSON.parse(readFileSync(file, 'utf8')).version;
  } catch {
    return undefined;
  }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function stageRuntimePackages() {
  const packagesDir = path.join(stageDir, 'runtime-packages');

  copyDirectory(
    path.join(root, 'packages/theme'),
    path.join(packagesDir, 'theme'),
  );
  copyDirectory(
    path.join(root, 'packages/content'),
    path.join(packagesDir, 'content'),
  );

  const themePackagePath = path.join(
    packagesDir,
    'theme/package.json',
  );
  const themePackage = JSON.parse(
    readFileSync(themePackagePath, 'utf8'),
  );
  themePackage.dependencies = {
    '@wordma/content': 'file:../content',
  };
  themePackage.devDependencies = {};
  delete themePackage.scripts;
  writeJson(themePackagePath, themePackage);

  const contentPackagePath = path.join(
    packagesDir,
    'content/package.json',
  );
  const contentPackage = JSON.parse(
    readFileSync(contentPackagePath, 'utf8'),
  );
  contentPackage.devDependencies = {};
  delete contentPackage.scripts;
  writeJson(contentPackagePath, contentPackage);
}

function stagePackageJson() {
  const enginePackage = JSON.parse(
    readFileSync(
      path.join(root, 'packages/engine/package.json'),
      'utf8',
    ),
  );
  const versions = {
    react:
      packageVersion('react') ??
      enginePackage.dependencies.react,
    'react-dom':
      packageVersion('react-dom') ??
      enginePackage.dependencies['react-dom'],
    lightningcss:
      packageVersion('lightningcss') ??
      enginePackage.dependencies.lightningcss,
  };

  writeJson(path.join(stageDir, 'package.json'), {
    name: 'wordma-engine-runtime',
    private: true,
    type: 'module',
    dependencies: {
      '@wordma/content':
        'file:./runtime-packages/content',
      '@wordma/theme': 'file:./runtime-packages/theme',
      ...versions,
    },
  });
}

function stageDefaultTheme() {
  copyDirectory(
    path.join(root, 'themes/default'),
    path.join(stageDir, 'themes/default'),
  );
}

function bundleEngine(bun) {
  const result = spawnSync(
    bun,
    [
      'build',
      'packages/engine/src/cli.ts',
      '--target=bun',
      '--minify',
      '--outfile',
      path.join(stageDir, 'cli.js'),
      '--external',
      'lightningcss',
      '--external',
      'react',
      '--external',
      'react/*',
      '--external',
      'react-dom',
      '--external',
      'react-dom/*',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(`engine bundle 失败：${result.status}`);
  }

  cpSync(
    path.join(
      root,
      'packages/engine/src/islands/runtime-entry.ts',
    ),
    path.join(stageDir, 'runtime-entry.ts'),
  );
}

function installRuntime(bun, triple) {
  const result = spawnSync(
    bun,
    [
      'install',
      '--production',
      '--ignore-scripts',
      '--no-progress',
      ...bunTargetFlags(triple),
    ],
    {
      cwd: stageDir,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(`engine 运行时依赖安装失败：${result.status}`);
  }
}

function directorySize(directory) {
  let total = 0;

  for (const entry of readdirSync(directory, {
    withFileTypes: true,
  })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(full);
    } else if (entry.isFile()) {
      total += statSync(full).size;
    }
  }

  return total;
}

function main() {
  const triple = targetTriple();
  const bun = bunBinary(triple);

  if (bun === 'bun' && !process.env.BUN_BIN) {
    console.warn(
      '未找到 Bun sidecar，尝试使用 PATH 中的 bun',
    );
  }

  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  console.log(`Engine staging → ${stageDir}`);
  console.log(`Target: ${triple ?? '(host)'}`);

  bundleEngine(bun);
  stageRuntimePackages();
  stageDefaultTheme();
  stagePackageJson();
  installRuntime(bun, triple);

  const size = directorySize(stageDir);
  console.log(
    `Engine staged: ${(size / 1024 / 1024).toFixed(1)} MiB`,
  );
}

main();
