#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectArtifacts } from './bundle-artifacts.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const TAURI_DIR = path.join(ROOT, 'apps/desktop/src-tauri');

const PLATFORM_ARTIFACTS = {
  linux: ['deb', 'appimage'],
  win32: ['msi', 'nsis'],
  darwin: ['dmg'],
};

export function parseDebControl(text) {
  const fields = new Map();

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith(' ') || line.startsWith('\t')) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    fields.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim(),
    );
  }

  return fields;
}

export function checkDebControl(
  fields,
  { version, architecture },
) {
  const errors = [];

  if (fields.get('Version') !== version) {
    errors.push(
      `deb Version=${fields.get('Version')}，期望 ${version}`,
    );
  }
  if (fields.get('Architecture') !== architecture) {
    errors.push(
      `deb Architecture=${fields.get('Architecture')}，期望 ${architecture}`,
    );
  }

  const depends = (fields.get('Depends') ?? '')
    .split(',')
    .map((value) => value.trim());

  for (const dependency of [
    'libwebkit2gtk-4.1-0',
    'libgtk-3-0',
  ]) {
    if (!depends.includes(dependency)) {
      errors.push(`deb 缺少运行依赖: ${dependency}`);
    }
  }

  return errors;
}

export function parseDebListing(text) {
  const entries = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^([dl-][rwxStTs-]{9})\s+\S+\s+\d+\s+\S+\s+\S+\s+(.+)$/,
    );
    if (!match) continue;
    entries.push({
      mode: match[1],
      path: match[2].replace(/^\.\//, ''),
    });
  }

  return entries;
}

export function checkDebListing(entries) {
  const errors = [];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));

  for (const required of [
    'usr/bin/bun',
    'usr/lib/Wordma/engine/cli.js',
    'usr/lib/Wordma/engine/runtime-entry.ts',
    'usr/lib/Wordma/engine/themes/default/theme.yaml',
  ]) {
    if (!byPath.has(required)) {
      errors.push(`deb 缺少文件: ${required}`);
    }
  }

  const bun = byPath.get('usr/bin/bun');
  if (bun && !bun.mode.includes('x')) {
    errors.push('deb 中 usr/bin/bun 缺少可执行权限');
  }

  if (
    !entries.some((entry) =>
      entry.path.endsWith('.desktop'),
    )
  ) {
    errors.push('deb 缺少桌面入口 .desktop');
  }

  return errors;
}

export function verifyArtifactSet(artifacts, platform) {
  const expected = PLATFORM_ARTIFACTS[platform];
  const errors = [];
  const warnings = [];

  if (!expected) {
    return {
      errors: [`不支持的平台: ${platform}`],
      warnings,
    };
  }

  const kinds = new Set(artifacts.map((artifact) => artifact.kind));

  for (const kind of expected) {
    if (!kinds.has(kind)) {
      errors.push(`缺少安装包: ${kind}`);
    }
  }

  for (const artifact of artifacts.filter(
    (value) => !value.directory,
  )) {
    if (artifact.size === 0) {
      errors.push(`安装包为空: ${artifact.name}`);
    } else if (artifact.size < 1024 * 1024) {
      warnings.push(
        `安装包小于 1 MiB，可能不完整: ${artifact.name}`,
      );
    }
  }

  return { errors, warnings };
}

export function parseAuthenticodeStatus(output) {
  return output.trim().split(/\r?\n/).pop()?.trim() ?? '';
}

export function expectedDebArchitecture(target) {
  if (!target) return 'amd64';
  if (target.startsWith('aarch64')) return 'arm64';
  return 'amd64';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

function usage() {
  return [
    'Usage: node scripts/verify-desktop-bundles.mjs [options]',
    '',
    'Options:',
    '  --bundle-dir <dir>       Bundle output directory',
    '  --platform <name>        linux | win32 | darwin (default: host)',
    '  --target <triple>        Expected target triple',
    '  --require-signature      Fail unsigned Windows installers',
    '  --help                   Show this message',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    bundleDir: null,
    platform: process.platform,
    target: null,
    requireSignature:
      process.env.WORDMA_REQUIRE_WINDOWS_SIGNATURE === '1',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    switch (value) {
      case '--bundle-dir':
        options.bundleDir = next;
        index += 1;
        break;
      case '--platform':
        options.platform = next;
        index += 1;
        break;
      case '--target':
        options.target = next;
        index += 1;
        break;
      case '--require-signature':
        options.requireSignature = true;
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

function windowsSignatureStatus(filePath) {
  const result = run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$s = Get-AuthenticodeSignature -LiteralPath $env:WORDMA_SIGN_PATH; Write-Output $s.Status',
    ],
    {
      env: {
        ...process.env,
        WORDMA_SIGN_PATH: filePath,
      },
    },
  );

  return result.ok
    ? parseAuthenticodeStatus(result.output)
    : `检查失败: ${result.output}`;
}

function verifyLinux(options, artifacts, version, warnings) {
  const errors = [];
  const debs = artifacts.filter(
    (artifact) => artifact.kind === 'deb',
  );

  for (const deb of debs) {
    const control = run('dpkg-deb', ['-f', deb.path]);
    if (!control.ok) {
      errors.push(`无法读取 deb control: ${deb.name}`);
      continue;
    }

    for (const error of checkDebControl(
      parseDebControl(control.output),
      {
        version,
        architecture: expectedDebArchitecture(
          options.target,
        ),
      },
    )) {
      errors.push(`${deb.name}: ${error}`);
    }

    const listing = run('dpkg-deb', ['-c', deb.path]);
    if (!listing.ok) {
      errors.push(`无法读取 deb 内容: ${deb.name}`);
      continue;
    }

    for (const error of checkDebListing(
      parseDebListing(listing.output),
    )) {
      errors.push(`${deb.name}: ${error}`);
    }
  }

  for (const appimage of artifacts.filter(
    (artifact) => artifact.kind === 'appimage',
  )) {
    const mode = statSync(appimage.path).mode;
    if ((mode & 0o111) === 0) {
      errors.push(`AppImage 缺少可执行权限: ${appimage.name}`);
    } else {
      console.log(`PASS AppImage 可执行: ${appimage.name}`);
    }
  }

  if (errors.length === 0) {
    warnings.push('未校验 AppImage 内部文件，依赖 deb 内容校验');
  }

  return errors;
}

function verifyWindows(options, artifacts, warnings) {
  const errors = [];
  const engine = path.join(TAURI_DIR, 'resources/engine/cli.js');

  if (!existsSync(engine)) {
    errors.push('缺少 staged engine 资源，安装包不完整');
  }

  const binaries = path.join(TAURI_DIR, 'binaries');
  const hasSidecar =
    existsSync(binaries) &&
    readdirSync(binaries).some(
      (name) =>
        name.startsWith('bun-') &&
        name.includes('windows') &&
        name.endsWith('.exe'),
    );

  if (!hasSidecar) {
    errors.push('缺少 Windows Bun sidecar');
  }

  for (const artifact of artifacts.filter(
    (value) => !value.directory,
  )) {
    const status = windowsSignatureStatus(artifact.path);

    if (status === 'Valid') {
      console.log(`PASS Authenticode: ${artifact.name}`);
    } else if (options.requireSignature) {
      errors.push(
        `Authenticode 无效: ${artifact.name} (${status})`,
      );
    } else {
      warnings.push(
        `未签名安装包，SmartScreen 会提示风险: ${artifact.name} (${status})`,
      );
    }
  }

  return errors;
}

function main() {
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

  if (!options.bundleDir) {
    console.error('缺少 --bundle-dir');
    console.error(usage());
    process.exit(2);
  }

  if (options.platform === 'darwin') {
    console.error(
      'macOS 产物请使用 scripts/verify-macos-release.mjs',
    );
    process.exit(2);
  }

  const packageJson = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  const artifacts = collectArtifacts(options.bundleDir);
  const { errors, warnings } = verifyArtifactSet(
    artifacts,
    options.platform,
  );

  for (const artifact of artifacts) {
    console.log(
      `FOUND ${artifact.kind}\t${artifact.name}\t${artifact.size} bytes`,
    );
  }

  if (options.platform === 'linux') {
    errors.push(
      ...verifyLinux(
        options,
        artifacts,
        packageJson.version,
        warnings,
      ),
    );
  }

  if (options.platform === 'win32') {
    errors.push(...verifyWindows(options, artifacts, warnings));
  }

  for (const warning of warnings) {
    console.log(`WARN ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`FAIL ${error}`);
    }
    console.error(`\n${errors.length} 项校验失败`);
    process.exit(1);
  }

  console.log('\n安装包校验通过');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
