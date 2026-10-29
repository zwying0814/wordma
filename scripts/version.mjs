#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const VERSION_TARGETS = [
  {
    path: 'apps/desktop/package.json',
    type: 'json',
  },
  {
    path: 'apps/desktop/src-tauri/tauri.conf.json',
    type: 'json',
  },
  {
    path: 'apps/desktop/src-tauri/Cargo.toml',
    type: 'cargo',
  },
  {
    path: 'apps/desktop/src-tauri/Cargo.lock',
    type: 'cargo-lock-desktop',
  },
  {
    path: 'packages/content/package.json',
    type: 'json',
  },
  {
    path: 'packages/theme/package.json',
    type: 'json',
  },
  {
    path: 'packages/engine/package.json',
    type: 'json',
  },
  {
    path: 'packages/create-wordma-theme/package.json',
    type: 'json',
  },
  {
    path: 'themes/default/package.json',
    type: 'json',
  },
  {
    path: 'themes/default/theme.yaml',
    type: 'theme-yaml',
  },
  {
    path: 'packages/engine/src/constants.ts',
    type: 'engine-version',
  },
];

function readText(root, relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function cargoPackageRange(source) {
  const header = /^\[package\][ \t]*$/m.exec(source);
  if (!header) throw new Error('缺少 [package] 段');

  const start = header.index + header[0].length;
  const rest = source.slice(start);
  const nextSection = /^\[/m.exec(rest);
  const end =
    nextSection === null ? source.length : start + nextSection.index;

  return { start, end, section: source.slice(start, end) };
}

function readCargoVersion(source) {
  const { section } = cargoPackageRange(source);
  const match = /^version\s*=\s*"([^"]+)"/m.exec(section);
  if (!match) throw new Error('[package] 缺少 version');
  return match[1];
}

function writeCargoVersion(source, version) {
  const { start, end, section } = cargoPackageRange(source);
  const updated = section.replace(
    /^version\s*=\s*"([^"]+)"/m,
    `version = "${version}"`,
  );

  return `${source.slice(0, start)}${updated}${source.slice(end)}`;
}

function readCargoLockVersion(source) {
  const match =
    /\[\[package\]\]\r?\nname = "desktop"\r?\nversion = "([^"]+)"/.exec(
      source,
    );
  if (!match) throw new Error('Cargo.lock 缺少 desktop package');
  return match[1];
}

function writeCargoLockVersion(source, version) {
  return source.replace(
    /(\[\[package\]\]\r?\nname = "desktop"\r?\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  );
}

function readTargetText(text, type) {
  switch (type) {
    case 'json':
      return JSON.parse(text).version;
    case 'cargo':
      return readCargoVersion(text);
    case 'cargo-lock-desktop':
      return readCargoLockVersion(text);
    case 'theme-yaml': {
      const match = /^version:\s*['"]?([^'"\s]+)['"]?/m.exec(text);
      if (!match) throw new Error('theme.yaml 缺少 version');
      return match[1];
    }
    case 'engine-version': {
      const match =
        /export const ENGINE_VERSION = '([^']+)';/.exec(text);
      if (!match) throw new Error('constants.ts 缺少 ENGINE_VERSION');
      return match[1];
    }
    default:
      throw new Error(`未知版本类型：${type}`);
  }
}

function writeTargetText(text, type, version) {
  switch (type) {
    case 'json': {
      const value = JSON.parse(text);
      value.version = version;
      return `${JSON.stringify(value, null, 2)}\n`;
    }
    case 'cargo':
      return writeCargoVersion(text, version);
    case 'cargo-lock-desktop':
      return writeCargoLockVersion(text, version);
    case 'theme-yaml':
      return text.replace(
        /^version:\s*['"]?([^'"\s]+)['"]?/m,
        `version: ${version}`,
      );
    case 'engine-version':
      return text.replace(
        /export const ENGINE_VERSION = '[^']+';/,
        `export const ENGINE_VERSION = '${version}';`,
      );
    default:
      throw new Error(`未知版本类型：${type}`);
  }
}

export function sourceVersion(root) {
  const packageJson = JSON.parse(
    readText(root, 'package.json'),
  );

  return packageJson.version;
}

export function checkVersions(root) {
  const issues = [];
  const targets = [];
  let version;

  try {
    version = sourceVersion(root);
  } catch (error) {
    issues.push({
      path: 'package.json',
      message: `读取根版本失败：${error.message}`,
    });
    return { version: undefined, targets, issues };
  }

  if (
    typeof version !== 'string' ||
    !VERSION_PATTERN.test(version)
  ) {
    issues.push({
      path: 'package.json',
      message: `版本不是合法 semver：${String(version)}`,
    });
    return { version, targets, issues };
  }

  for (const target of VERSION_TARGETS) {
    const fullPath = path.join(root, target.path);

    if (!existsSync(fullPath)) {
      issues.push({
        path: target.path,
        message: '文件不存在',
      });
      continue;
    }

    try {
      const current = readTargetText(
        readFileSync(fullPath, 'utf8'),
        target.type,
      );
      targets.push({ ...target, current, expected: version });

      if (current !== version) {
        issues.push({
          path: target.path,
          message: `版本不一致：${current} != ${version}`,
        });
      }
    } catch (error) {
      issues.push({
        path: target.path,
        message: error.message,
      });
    }
  }

  return { version, targets, issues };
}

export function syncVersions(root) {
  const version = sourceVersion(root);

  if (
    typeof version !== 'string' ||
    !VERSION_PATTERN.test(version)
  ) {
    throw new Error(`根版本不是合法 semver：${String(version)}`);
  }

  const updated = [];

  for (const target of VERSION_TARGETS) {
    const fullPath = path.join(root, target.path);
    const source = readFileSync(fullPath, 'utf8');
    const current = readTargetText(source, target.type);

    if (current === version) continue;

    writeFileSync(
      fullPath,
      writeTargetText(source, target.type, version),
    );
    updated.push(target.path);
  }

  const result = checkVersions(root);
  if (result.issues.length > 0) {
    throw new Error(
      `同步后仍有版本问题：\n${result.issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`,
    );
  }

  return { version, updated };
}

function main() {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const command = process.argv[2] ?? 'check';

  if (command === 'check') {
    const result = checkVersions(root);

    if (result.issues.length > 0) {
      console.error('版本检查失败：');
      for (const issue of result.issues) {
        console.error(`✗ ${issue.path}: ${issue.message}`);
      }
      process.exit(1);
    }

    console.log(
      `✓ 版本一致：${result.version}（${result.targets.length} 个文件）`,
    );
    return;
  }

  if (command === 'sync') {
    const result = syncVersions(root);
    console.log(
      `✓ 已同步版本 ${result.version}，更新 ${result.updated.length} 个文件`,
    );
    for (const file of result.updated) {
      console.log(`  - ${file}`);
    }
    return;
  }

  console.error('用法：node scripts/version.mjs <check|sync>');
  process.exit(1);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
