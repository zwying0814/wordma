#!/usr/bin/env node
/**
 * 下载与当前目标匹配的 Bun，并按 Tauri sidecar 约定命名。
 *
 * 版本与 npm integrity 固定在 scripts/bun-version.json。
 */
import { execFileSync } from 'node:child_process';
import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(appRoot, '../..');
const configPath = path.join(
  repoRoot,
  'scripts/bun-version.json',
);

/** 当前主机对应的 Tauri target triple */
const HOST_TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

function readTargetArg() {
  const index = process.argv.indexOf('--target');
  if (index !== -1) return process.argv[index + 1];

  const inline = process.argv.find((arg) =>
    arg.startsWith('--target='),
  );
  return inline?.slice('--target='.length);
}

export function loadBunConfig(file = configPath) {
  const config = JSON.parse(readFileSync(file, 'utf8'));

  if (
    typeof config.version !== 'string' ||
    typeof config.registry !== 'string' ||
    typeof config.targets !== 'object' ||
    config.targets === null
  ) {
    throw new Error('bun-version.json 格式无效');
  }

  for (const [triple, target] of Object.entries(
    config.targets,
  )) {
    if (
      typeof target.package !== 'string' ||
      typeof target.integrity !== 'string' ||
      !target.integrity.startsWith('sha512-')
    ) {
      throw new Error(
        `bun-version.json target 无效：${triple}`,
      );
    }
  }

  return config;
}

export function computeSha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function parseIntegrity(integrity) {
  const value = integrity
    .split(/\s+/)
    .find(
      (item) =>
        item.startsWith('sha512-') ||
        item.startsWith('sha256-'),
    );

  if (!value) {
    throw new Error(`不支持的 integrity：${integrity}`);
  }

  const separator = value.indexOf('-');
  return {
    algorithm: value.slice(0, separator),
    digest: Buffer.from(
      value.slice(separator + 1),
      'base64',
    ),
  };
}

export function verifyIntegrity(data, integrity) {
  const expected = parseIntegrity(integrity);
  const actual = createHash(expected.algorithm)
    .update(data)
    .digest();

  return (
    actual.length === expected.digest.length &&
    timingSafeEqual(actual, expected.digest)
  );
}

export function validateBinaryArchitecture(
  data,
  triple,
) {
  if (triple.endsWith('apple-darwin')) {
    if (
      data.length < 8 ||
      data.readUInt32LE(0) !== 0xfeedfacf
    ) {
      throw new Error('Bun 不是 64 位 Mach-O 文件');
    }

    const cpu = data.readUInt32LE(4);
    const expected =
      triple.startsWith('aarch64')
        ? 0x0100000c
        : 0x01000007;

    if (cpu !== expected) {
      throw new Error(
        `Bun 架构不匹配：Mach-O CPU 0x${cpu.toString(
          16,
        )}，期望 ${triple}`,
      );
    }
    return;
  }

  if (triple.includes('linux')) {
    if (
      data.length < 20 ||
      data[0] !== 0x7f ||
      data[1] !== 0x45 ||
      data[2] !== 0x4c ||
      data[3] !== 0x46 ||
      data[4] !== 2
    ) {
      throw new Error('Bun 不是 64 位 ELF 文件');
    }

    const machine = data.readUInt16LE(18);
    const expected = triple.startsWith('aarch64')
      ? 183
      : 62;

    if (machine !== expected) {
      throw new Error(
        `Bun 架构不匹配：ELF machine ${machine}，期望 ${triple}`,
      );
    }
    return;
  }

  if (triple.includes('windows')) {
    if (
      data.length < 0x40 ||
      data.toString('ascii', 0, 2) !== 'MZ'
    ) {
      throw new Error('Bun 不是 PE 文件');
    }

    const peOffset = data.readUInt32LE(0x3c);
    if (
      peOffset + 6 > data.length ||
      data.toString('ascii', peOffset, peOffset + 4) !==
        'PE\0\0'
    ) {
      throw new Error('Bun PE 头无效');
    }

    const machine = data.readUInt16LE(peOffset + 4);
    const expected = triple.startsWith('aarch64')
      ? 0xaa64
      : 0x8664;

    if (machine !== expected) {
      throw new Error(
        `Bun 架构不匹配：PE machine 0x${machine.toString(
          16,
        )}，期望 ${triple}`,
      );
    }
    return;
  }

  throw new Error(`不支持的目标：${triple}`);
}

export function verifyExistingSidecar(
  dest,
  markerPath,
  expected,
) {
  if (!existsSync(dest) || !existsSync(markerPath)) {
    return false;
  }

  try {
    const marker = JSON.parse(
      readFileSync(markerPath, 'utf8'),
    );

    if (
      marker.version !== expected.version ||
      marker.target !== expected.target ||
      marker.package !== expected.package ||
      marker.integrity !== expected.integrity
    ) {
      return false;
    }

    const data = readFileSync(dest);
    return (
      data.length === marker.size &&
      computeSha256(data) === marker.sha256
    );
  } catch {
    return false;
  }
}

function writeMarker(markerPath, marker) {
  writeFileSync(
    markerPath,
    `${JSON.stringify(marker, null, 2)}\n`,
  );
}

function installBinary(dest, data) {
  const temp = `${dest}.${process.pid}.tmp`;
  writeFileSync(temp, data);
  if (process.platform !== 'win32') {
    chmodSync(temp, 0o755);
  }

  try {
    renameSync(temp, dest);
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }
    if (existsSync(dest)) unlinkSync(dest);
    renameSync(temp, dest);
  }
}

function main() {
  return run();
}

async function run() {
  const config = loadBunConfig();
  const triple =
    readTargetArg() ??
    process.env.BUN_TARGET ??
    HOST_TRIPLES[`${process.platform}-${process.arch}`];
  const target = triple ? config.targets[triple] : undefined;

  if (!triple || !target) {
    console.error(
      `不支持的目标：${
        triple ?? `${process.platform}-${process.arch}`
      }`,
    );
    process.exit(1);
  }

  if (
    process.env.BUN_VERSION &&
    process.env.BUN_VERSION !== config.version
  ) {
    console.error(
      `BUN_VERSION 已固定为 ${config.version}；请修改 scripts/bun-version.json`,
    );
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const check = process.argv.includes('--check');
  const registry =
    process.env.NPM_REGISTRY ?? config.registry;
  const binDir = path.join(
    appRoot,
    'src-tauri',
    'binaries',
  );
  const extension = triple.includes('windows') ? '.exe' : '';
  const dest = path.join(
    binDir,
    `bun-${triple}${extension}`,
  );
  const markerPath = `${dest}.verified.json`;
  const expected = {
    version: config.version,
    target: triple,
    package: target.package,
    integrity: target.integrity,
  };

  if (
    !force &&
    verifyExistingSidecar(dest, markerPath, expected)
  ) {
    console.log(
      `Bun ${config.version} sidecar 已校验：${path.relative(
        process.cwd(),
        dest,
      )}`,
    );
    return;
  }

  if (check) {
    console.error(
      `Bun sidecar 未通过校验：${path.relative(
        process.cwd(),
        dest,
      )}\n运行 pnpm --filter desktop fetch:bun 重新下载`,
    );
    process.exit(1);
  }

  mkdirSync(binDir, { recursive: true });
  const workDir = mkdtempSync(
    path.join(tmpdir(), 'wordma-bun-'),
  );

  try {
    const tarball = `${registry}/@oven/${target.package}/-/${target.package}-${config.version}.tgz`;
    console.log(
      `下载 Bun ${config.version}（${target.package}）…`,
    );

    const response = await fetch(tarball);

    if (!response.ok) {
      throw new Error(
        `下载失败：${response.status} ${response.statusText}\n${tarball}`,
      );
    }

    const archiveData = Buffer.from(
      await response.arrayBuffer(),
    );

    if (
      !verifyIntegrity(archiveData, target.integrity)
    ) {
      throw new Error(
        `Bun tarball integrity 校验失败：${target.package}`,
      );
    }

    const archive = path.join(workDir, 'bun.tgz');
    writeFileSync(archive, archiveData);
    execFileSync('tar', ['-xzf', archive, '-C', workDir], {
      stdio: 'inherit',
    });

    const source = path.join(
      workDir,
      'package',
      'bin',
      `bun${extension}`,
    );
    if (!existsSync(source)) {
      throw new Error(
        `Bun tarball 缺少可执行文件：${source}`,
      );
    }

    const data = readFileSync(source);
    validateBinaryArchitecture(data, triple);
    const sha256 = computeSha256(data);

    installBinary(dest, data);
    writeMarker(markerPath, {
      ...expected,
      sha256,
      size: data.length,
    });

    console.log(
      `已校验并写入：${path.relative(
        process.cwd(),
        dest,
      )}`,
    );
  } finally {
    rmSync(workDir, {
      recursive: true,
      force: true,
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
