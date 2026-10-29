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
  REQUIRED_ENTITLEMENTS,
  defaultBundleDir,
  entitlementErrors,
  findArtifacts,
  findNativeModules,
  isRealSignature,
  parseCodesignDisplay,
  parseEntitlements,
} from './verify-macos-release.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('解析 codesign 输出中的签名与 flags', () => {
  const signed = parseCodesignDisplay(
    [
      'Executable=/tmp/Wordma.app/Contents/MacOS/desktop',
      'Identifier=life.zwy.wordma',
      'Signature=Developer ID Application: Wordma (TEAMID)',
      'TeamIdentifier=TEAMID',
      'flags=0x10000(runtime)',
    ].join('\n'),
  );

  assert.equal(signed.signature, 'Developer ID Application: Wordma (TEAMID)');
  assert.equal(signed.teamIdentifier, 'TEAMID');
  assert.ok(signed.flags.has('runtime'));
  assert.equal(isRealSignature(signed), true);

  const adhoc = parseCodesignDisplay(
    [
      'Identifier=desktop-123',
      'Signature=adhoc',
      'flags=0x20002(adhoc,linker-signed)',
    ].join('\n'),
  );

  assert.equal(isRealSignature(adhoc), false);
  assert.ok(adhoc.flags.has('linker-signed'));
});

test('解析 entitlements 并校验必需/禁止项', () => {
  const xml = [
    '<plist version="1.0"><dict>',
    '<key>com.apple.security.cs.allow-jit</key><true/>',
    '<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>',
    '<key>com.apple.security.cs.disable-library-validation</key><true/>',
    '<key>com.apple.security.network.client</key><true/>',
    '</dict></plist>',
  ].join('');

  const values = parseEntitlements(xml);

  for (const key of REQUIRED_ENTITLEMENTS) {
    assert.equal(values.get(key), true);
  }

  const errors = entitlementErrors(values);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /network/);

  const missing = entitlementErrors(new Map());
  assert.equal(missing.length, REQUIRED_ENTITLEMENTS.length);
});

test('仓库签名配置启用 Hardened Runtime 与最小 entitlements', () => {
  const tauriConfig = JSON.parse(
    readFileSync(
      path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'),
      'utf8',
    ),
  );
  const macos = tauriConfig.bundle.macOS;

  assert.equal(macos.hardenedRuntime, true);
  assert.equal(macos.entitlements, 'entitlements.plist');

  const plist = readFileSync(
    path.join(root, 'apps/desktop/src-tauri/entitlements.plist'),
    'utf8',
  );
  const values = parseEntitlements(plist);

  for (const key of REQUIRED_ENTITLEMENTS) {
    assert.equal(values.get(key), true, `缺少 ${key}`);
  }

  assert.deepEqual(entitlementErrors(values), []);
});

test('从 bundle 目录中发现 app 与 dmg', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'wordma-bundle-'));
  const bundleDir = path.join(rootDir, 'bundle');

  try {
    assert.deepEqual(findArtifacts(bundleDir), {
      app: null,
      dmg: null,
    });

    mkdirSync(path.join(bundleDir, 'macos'), { recursive: true });
    mkdirSync(path.join(bundleDir, 'dmg'), { recursive: true });
    writeFileSync(path.join(bundleDir, 'macos/desktop.app'), '');
    writeFileSync(path.join(bundleDir, 'macos/Wordma.app'), '');
    writeFileSync(path.join(bundleDir, 'dmg/Wordma_0.1.0_aarch64.dmg'), '');

    const artifacts = findArtifacts(bundleDir);
    assert.equal(
      artifacts.app,
      path.join(bundleDir, 'macos/Wordma.app'),
    );
    assert.equal(
      artifacts.dmg,
      path.join(bundleDir, 'dmg/Wordma_0.1.0_aarch64.dmg'),
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('发现 engine 资源中的原生模块', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'wordma-engine-'));
  const engineDir = path.join(
    rootDir,
    'Wordma.app/Contents/Resources/engine',
  );

  try {
    assert.deepEqual(findNativeModules(path.join(rootDir, 'Wordma.app')), []);

    const moduleDir = path.join(
      engineDir,
      'node_modules/lightningcss-darwin-arm64',
    );
    mkdirSync(moduleDir, { recursive: true });
    writeFileSync(
      path.join(moduleDir, 'lightningcss.darwin-arm64.node'),
      '',
    );
    writeFileSync(path.join(engineDir, 'cli.js'), '');

    assert.deepEqual(
      findNativeModules(path.join(rootDir, 'Wordma.app')),
      [path.join(moduleDir, 'lightningcss.darwin-arm64.node')],
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('目标 triple 使用独立的 bundle 目录', () => {
  assert.match(
    defaultBundleDir('aarch64-apple-darwin'),
    /target\/aarch64-apple-darwin\/release\/bundle$/,
  );
  assert.match(defaultBundleDir(), /target\/release\/bundle$/);
});
