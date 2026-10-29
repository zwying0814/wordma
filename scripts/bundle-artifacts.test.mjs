import assert from 'node:assert/strict';
import {
  cpSync,
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
  checksumLines,
  collectArtifacts,
  parseChecksums,
  verifyChecksums,
  writeChecksums,
} from './bundle-artifacts.mjs';
import {
  checkDebControl,
  checkDebListing,
  expectedDebArchitecture,
  parseAuthenticodeStatus,
  parseDebControl,
  parseDebListing,
  verifyArtifactSet,
} from './verify-desktop-bundles.mjs';

function createBundle(rootDir) {
  const bundleDir = path.join(rootDir, 'bundle');

  for (const [directory, name] of [
    ['dmg', 'Wordma_0.1.0_aarch64.dmg'],
    ['msi', 'Wordma_0.1.0_x64_en-US.msi'],
    ['nsis', 'Wordma_0.1.0_x64-setup.exe'],
    ['appimage', 'Wordma_0.1.0_amd64.AppImage'],
    ['deb', 'Wordma_0.1.0_amd64.deb'],
    ['rpm', 'Wordma-0.1.0-1.x86_64.rpm'],
  ]) {
    const directoryPath = path.join(bundleDir, directory);
    mkdirSync(directoryPath, { recursive: true });
    writeFileSync(path.join(directoryPath, name), name);
  }

  mkdirSync(
    path.join(bundleDir, 'macos/Wordma.app/Contents'),
    { recursive: true },
  );

  return bundleDir;
}

test('收集各平台安装包并忽略非目标文件', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'wordma-artifacts-'));
  const bundleDir = createBundle(rootDir);
  writeFileSync(path.join(bundleDir, 'dmg/notes.txt'), 'ignore');

  try {
    const artifacts = collectArtifacts(bundleDir);

    assert.deepEqual(
      artifacts.map((artifact) => artifact.kind),
      ['app', 'appimage', 'deb', 'dmg', 'msi', 'nsis', 'rpm'],
    );
    assert.equal(
      artifacts.find((artifact) => artifact.kind === 'app').directory,
      true,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('生成并校验 SHA-256 checksum', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'wordma-checksum-'));
  const bundleDir = createBundle(rootDir);
  const output = path.join(rootDir, 'SHA256SUMS.txt');

  try {
    const artifacts = collectArtifacts(bundleDir);
    const lines = writeChecksums(artifacts, output);
    const content = readFileSync(output, 'utf8');

    assert.equal(lines.length, 6);
    assert.equal(
      content,
      `${lines.join('\n')}\n`,
    );
    assert.match(
      content,
      /^[a-f0-9]{64} {2}Wordma_0\.1\.0_aarch64\.dmg$/m,
    );
    assert.equal(
      checksumLines(artifacts).length,
      lines.length,
    );

    const assetsDir = path.join(rootDir, 'assets');
    mkdirSync(assetsDir);
    for (const artifact of artifacts.filter(
      (value) => !value.directory,
    )) {
      cpSync(
        artifact.path,
        path.join(assetsDir, artifact.name),
      );
    }

    const verified = verifyChecksums(content, assetsDir);
    assert.equal(verified.checked, 6);
    assert.deepEqual(verified.errors, []);

    writeFileSync(
      path.join(assetsDir, 'Wordma_0.1.0_amd64.deb'),
      'tampered',
    );
    const tampered = verifyChecksums(content, assetsDir);
    assert.equal(tampered.errors.length, 1);
    assert.match(tampered.errors[0], /hash 不匹配/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('checksum 解析拒绝非法行与缺失文件', () => {
  assert.throws(
    () => parseChecksums('not-a-checksum'),
    /无法解析/,
  );

  const result = verifyChecksums(
    `${'0'.repeat(64)}  missing.dmg\n`,
    tmpdir(),
  );
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /缺少文件/);
});

test('deb control 校验版本、架构与运行依赖', () => {
  const fields = parseDebControl(
    [
      'Package: wordma',
      'Version: 0.1.0',
      'Architecture: amd64',
      'Depends: libwebkit2gtk-4.1-0, libgtk-3-0',
      'Description: Wordma',
      ' multi-line description',
      '',
    ].join('\n'),
  );

  assert.equal(fields.get('Package'), 'wordma');
  assert.deepEqual(
    checkDebControl(fields, {
      version: '0.1.0',
      architecture: 'amd64',
    }),
    [],
  );

  const errors = checkDebControl(fields, {
    version: '0.2.0',
    architecture: 'arm64',
  });
  assert.equal(errors.length, 2);

  const missing = checkDebControl(
    parseDebControl('Version: 0.1.0\nArchitecture: amd64'),
    { version: '0.1.0', architecture: 'amd64' },
  );
  assert.equal(missing.length, 2);

  assert.equal(
    expectedDebArchitecture('aarch64-unknown-linux-gnu'),
    'arm64',
  );
  assert.equal(
    expectedDebArchitecture('x86_64-unknown-linux-gnu'),
    'amd64',
  );
});

test('deb 内容校验 engine、sidecar 与桌面入口', () => {
  const listing = [
    'drwxr-xr-x root/root 0 2026-01-01 00:00 ./usr/',
    'drwxr-xr-x root/root 0 2026-01-01 00:00 ./usr/bin/',
    '-rwxr-xr-x root/root 1024 2026-01-01 00:00 ./usr/bin/bun',
    '-rwxr-xr-x root/root 1024 2026-01-01 00:00 ./usr/bin/desktop',
    '-rw-r--r-- root/root 1024 2026-01-01 00:00 ./usr/lib/Wordma/engine/cli.js',
    '-rw-r--r-- root/root 1024 2026-01-01 00:00 ./usr/lib/Wordma/engine/runtime-entry.ts',
    '-rw-r--r-- root/root 1024 2026-01-01 00:00 ./usr/lib/Wordma/engine/themes/default/theme.yaml',
    '-rw-r--r-- root/root 1024 2026-01-01 00:00 ./usr/share/applications/wordma.desktop',
  ].join('\n');

  const entries = parseDebListing(listing);
  assert.equal(entries.length, 8);
  assert.equal(
    entries.find((entry) => entry.path === 'usr/bin/bun').mode,
    '-rwxr-xr-x',
  );
  assert.deepEqual(checkDebListing(entries), []);

  const broken = checkDebListing(
    entries.filter(
      (entry) =>
        entry.path !== 'usr/bin/bun' &&
        !entry.path.endsWith('.desktop'),
    ),
  );
  assert.equal(broken.length, 2);
  assert.ok(
    broken.some((error) => error.includes('usr/bin/bun')),
  );
  assert.ok(
    broken.some((error) => error.includes('.desktop')),
  );
});

test('安装包集合按平台校验缺失与空文件', () => {
  const linux = verifyArtifactSet(
    [
      { kind: 'deb', name: 'a.deb', size: 2 * 1024 * 1024 },
      { kind: 'appimage', name: 'a.AppImage', size: 2 * 1024 * 1024 },
    ],
    'linux',
  );
  assert.deepEqual(linux.errors, []);
  assert.deepEqual(linux.warnings, []);

  const missing = verifyArtifactSet(
    [{ kind: 'deb', name: 'a.deb', size: 0 }],
    'linux',
  );
  assert.equal(missing.errors.length, 2);
  assert.ok(
    missing.errors.some((error) => error.includes('appimage')),
  );
  assert.ok(
    missing.errors.some((error) => error.includes('安装包为空')),
  );

  assert.equal(
    verifyArtifactSet([], 'win32').errors.length,
    2,
  );
  assert.match(
    verifyArtifactSet([], 'plan9').errors[0],
    /不支持/,
  );
});

test('解析 Authenticode 状态', () => {
  assert.equal(
    parseAuthenticodeStatus('Valid\r\n'),
    'Valid',
  );
  assert.equal(
    parseAuthenticodeStatus('Warning\nNotSigned\n'),
    'NotSigned',
  );
});

test('仓库包含 Linux 运行依赖与 NSIS 语言配置', () => {
  const config = JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        '../apps/desktop/src-tauri/tauri.conf.json',
      ),
      'utf8',
    ),
  );

  assert.deepEqual(config.bundle.linux.deb.depends, [
    'libwebkit2gtk-4.1-0',
    'libgtk-3-0',
  ]);
  assert.deepEqual(config.bundle.windows.nsis.languages, [
    'SimpChinese',
    'English',
  ]);
  assert.equal(
    config.bundle.windows.nsis.displayLanguageSelector,
    true,
  );
});
