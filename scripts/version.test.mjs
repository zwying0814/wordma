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
import { fileURLToPath } from 'node:url';

import {
  VERSION_TARGETS,
  checkVersions,
  syncVersions,
} from './version.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function createFixture(version = '1.2.3') {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-version-'),
  );

  writeFile(
    root,
    'package.json',
    `${JSON.stringify({ name: 'wordma', version }, null, 2)}\n`,
  );

  for (const target of VERSION_TARGETS) {
    switch (target.type) {
      case 'json':
        writeFile(
          root,
          target.path,
          `${JSON.stringify({ version: '0.0.0' }, null, 2)}\n`,
        );
        break;
      case 'cargo':
        writeFile(
          root,
          target.path,
          [
            '[package]',
            'name = "desktop"',
            'version = "0.1.0"',
            '',
            '[dependencies]',
            'serde = { version = "1" }',
            '',
          ].join('\n'),
        );
        break;
      case 'cargo-lock-desktop':
        writeFile(
          root,
          target.path,
          [
            '[[package]]',
            'name = "desktop"',
            'version = "0.1.0"',
            '',
            '[[package]]',
            'name = "other"',
            'version = "9.9.9"',
            '',
          ].join('\n'),
        );
        break;
      case 'theme-yaml':
        writeFile(
          root,
          target.path,
          ['id: wordma-theme-default', 'version: 0.0.0', ''].join(
            '\n',
          ),
        );
        break;
      case 'engine-version':
        writeFile(
          root,
          target.path,
          [
            "export const ENGINE_NAME = '@wordma/engine';",
            "export const ENGINE_VERSION = '0.0.0';",
            '',
          ].join('\n'),
        );
        break;
      default:
        throw new Error(`未覆盖类型：${target.type}`);
    }
  }

  return root;
}

test('check 检测所有版本不一致', () => {
  const root = createFixture('1.2.3');

  try {
    const result = checkVersions(root);
    assert.equal(result.version, '1.2.3');
    assert.equal(result.issues.length, VERSION_TARGETS.length);
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('0.1.0 != 1.2.3'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sync 同步全部目标并保留其他版本字段', () => {
  const root = createFixture('2.0.0');

  try {
    const synced = syncVersions(root);
    assert.equal(synced.version, '2.0.0');
    assert.equal(synced.updated.length, VERSION_TARGETS.length);
    assert.equal(checkVersions(root).issues.length, 0);

    const cargo = readFileSync(
      path.join(root, 'apps/desktop/src-tauri/Cargo.toml'),
      'utf8',
    );
    assert.match(cargo, /^version = "2\.0\.0"$/m);
    assert.match(cargo, /serde = \{ version = "1" \}/);

    const lock = readFileSync(
      path.join(
        root,
        'apps/desktop/src-tauri/Cargo.lock',
      ),
      'utf8',
    );
    assert.match(
      lock,
      /name = "desktop"\nversion = "2\.0\.0"/,
    );
    assert.match(
      lock,
      /name = "other"\nversion = "9\.9\.9"/,
    );

    const constants = readFileSync(
      path.join(
        root,
        'packages/engine/src/constants.ts',
      ),
      'utf8',
    );
    assert.match(
      constants,
      /ENGINE_VERSION = '2\.0\.0'/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('非法根版本与缺失目标会失败', () => {
  const root = createFixture('1.0');

  try {
    const invalid = checkVersions(root);
    assert.ok(
      invalid.issues.some((issue) =>
        issue.path.endsWith('package.json'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('仓库版本一致且 Tauri 元数据完整', () => {
  const result = checkVersions(repoRoot);
  assert.equal(result.issues.length, 0);

  const config = JSON.parse(
    readFileSync(
      path.join(
        repoRoot,
        'apps/desktop/src-tauri/tauri.conf.json',
      ),
      'utf8',
    ),
  );
  const rootPackage = JSON.parse(
    readFileSync(
      path.join(repoRoot, 'package.json'),
      'utf8',
    ),
  );

  assert.equal(config.productName, 'Wordma');
  assert.equal(config.version, rootPackage.version);
  assert.equal(config.bundle.category, 'Productivity');
  assert.ok(config.bundle.shortDescription.length > 0);
  assert.ok(config.bundle.longDescription.length > 0);
  assert.equal(
    config.bundle.macOS.minimumSystemVersion,
    '13.0',
  );
});
