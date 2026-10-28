import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const desktop = path.join(root, 'apps/desktop');
const problems = [];

function fail(message) {
  problems.push(message);
}

function walk(directory) {
  return readdirSync(directory, {
    withFileTypes: true,
  }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(fullPath)
      : [fullPath];
  });
}

// 1. 前端不得依赖或调用 shell 插件
const packageJson = JSON.parse(
  readFileSync(
    path.join(desktop, 'package.json'),
    'utf8',
  ),
);
for (const section of [
  'dependencies',
  'devDependencies',
]) {
  if (
    packageJson[section]?.['@tauri-apps/plugin-shell']
  ) {
    fail(
      `desktop/${section} 仍包含 @tauri-apps/plugin-shell`,
    );
  }
}

const forbidden = [
  '@tauri-apps/plugin-shell',
  'Command.sidecar',
  'binaries/bun',
];
for (const file of walk(
  path.join(desktop, 'src'),
)) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue;

  const source = readFileSync(file, 'utf8');
  for (const token of forbidden) {
    if (source.includes(token)) {
      fail(
        `${path.relative(root, file)} 使用了禁止的 shell/Bun 调用：${token}`,
      );
    }
  }
}

if (existsSync(path.join(desktop, 'src/lib/bun.ts'))) {
  fail('src/lib/bun.ts 仍然存在');
}

// 2. capability 不得授予 shell 权限
const capabilitiesDir = path.join(
  desktop,
  'src-tauri/capabilities',
);
const capabilityFiles = readdirSync(
  capabilitiesDir,
).filter((file) => file.endsWith('.json'));

for (const file of capabilityFiles) {
  const capability = JSON.parse(
    readFileSync(
      path.join(capabilitiesDir, file),
      'utf8',
    ),
  );
  const permissions =
    capability.permissions ?? [];

  for (const permission of permissions) {
    const identifier =
      typeof permission === 'string'
        ? permission
        : permission?.identifier;

    if (
      typeof identifier === 'string' &&
      identifier.startsWith('shell:')
    ) {
      fail(
        `capability ${file} 仍授予 shell 权限：${identifier}`,
      );
    }
  }

  if (
    file === 'default.json' &&
    JSON.stringify(capability.windows) !==
      JSON.stringify(['main'])
  ) {
    fail(
      `default.json 只应作用于 main 窗口，当前：${JSON.stringify(
        capability.windows,
      )}`,
    );
  }

  if (file === 'preview.json') {
    if (
      JSON.stringify(capability.windows) !==
      JSON.stringify(['preview'])
    ) {
      fail(
        `preview.json 只应作用于 preview 窗口，当前：${JSON.stringify(
          capability.windows,
        )}`,
      );
    }
    if (permissions.length > 0) {
      fail(
        `preview.json 必须为空权限，当前：${permissions.length} 项`,
      );
    }
  }
}

// 3. CSP 必须存在，生产模式不得允许 eval
const tauriConfig = JSON.parse(
  readFileSync(
    path.join(
      desktop,
      'src-tauri/tauri.conf.json',
    ),
    'utf8',
  ),
);
const security = tauriConfig.app?.security ?? {};

if (
  typeof security.csp !== 'string' ||
  security.csp.trim() === ''
) {
  fail('tauri.conf.json 缺少生产 CSP');
} else {
  if (!security.csp.includes("script-src 'self'")) {
    fail("生产 CSP 必须包含 script-src 'self'");
  }
  if (security.csp.includes("'unsafe-eval'")) {
    fail('生产 CSP 不能包含 unsafe-eval');
  }
}

if (
  typeof security.devCsp !== 'string' ||
  security.devCsp.trim() === ''
) {
  fail('tauri.conf.json 缺少 devCsp');
}

if (problems.length > 0) {
  console.error('安全审计失败：');
  for (const problem of problems) {
    console.error(`✗ ${problem}`);
  }
  process.exit(1);
}

console.log('✓ 主窗口无 shell/Bun 执行权限');
console.log('✓ 前端无 shell 插件调用');
console.log('✓ 生产 CSP 已设置且无 unsafe-eval');
console.log('✓ preview 窗口无 Tauri 权限');
