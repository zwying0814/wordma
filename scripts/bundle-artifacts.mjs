#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const KINDS = [
  { kind: 'dmg', dir: 'dmg', extension: '.dmg' },
  { kind: 'app', dir: 'macos', extension: '.app', directory: true },
  { kind: 'msi', dir: 'msi', extension: '.msi' },
  { kind: 'nsis', dir: 'nsis', extension: '.exe' },
  { kind: 'appimage', dir: 'appimage', extension: '.AppImage' },
  { kind: 'deb', dir: 'deb', extension: '.deb' },
  { kind: 'rpm', dir: 'rpm', extension: '.rpm' },
];

export function collectArtifacts(bundleDir) {
  const artifacts = [];

  for (const definition of KINDS) {
    const directory = path.join(bundleDir, definition.dir);
    if (!existsSync(directory)) continue;

    for (const name of readdirSync(directory)) {
      if (!name.endsWith(definition.extension)) continue;
      const artifactPath = path.join(directory, name);
      const stats = statSync(artifactPath);

      if (Boolean(definition.directory) !== stats.isDirectory()) {
        continue;
      }

      artifacts.push({
        kind: definition.kind,
        name,
        path: artifactPath,
        size: stats.size,
        directory: stats.isDirectory(),
      });
    }
  }

  return artifacts.sort((left, right) =>
    `${left.kind}/${left.name}`.localeCompare(
      `${right.kind}/${right.name}`,
    ),
  );
}

export function sha256File(filePath) {
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex');
}

export function checksumLines(artifacts) {
  return artifacts
    .filter((artifact) => !artifact.directory)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (artifact) =>
        `${sha256File(artifact.path)}  ${artifact.name}`,
    );
}

export function writeChecksums(artifacts, outputPath) {
  const files = artifacts.filter((artifact) => !artifact.directory);

  if (files.length === 0) {
    throw new Error('没有可生成 checksum 的安装包');
  }

  const lines = checksumLines(files);
  writeFileSync(outputPath, `${lines.join('\n')}\n`);
  return lines;
}

export function parseChecksums(content) {
  const entries = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) {
      throw new Error(`无法解析 checksum 行: ${rawLine}`);
    }

    entries.push({ hash: match[1].toLowerCase(), name: match[2] });
  }

  return entries;
}

export function verifyChecksums(content, baseDir) {
  const entries = parseChecksums(content);
  const errors = [];

  for (const entry of entries) {
    const filePath = path.join(baseDir, entry.name);
    if (!existsSync(filePath)) {
      errors.push(`缺少文件: ${entry.name}`);
      continue;
    }

    const actual = sha256File(filePath);
    if (actual !== entry.hash) {
      errors.push(
        `hash 不匹配: ${entry.name} 期望 ${entry.hash} 实际 ${actual}`,
      );
    }
  }

  return { checked: entries.length, errors };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/bundle-artifacts.mjs list --bundle-dir <dir>',
    '  node scripts/bundle-artifacts.mjs checksum --bundle-dir <dir> --out <file>',
    '  node scripts/bundle-artifacts.mjs verify --file <file> --dir <dir>',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { command: argv[0] ?? null };

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    switch (value) {
      case '--bundle-dir':
        if (!next || next.startsWith('--')) {
          throw new Error('--bundle-dir 缺少参数值');
        }
        options.bundleDir = next;
        index += 1;
        break;
      case '--out':
        if (!next || next.startsWith('--')) {
          throw new Error('--out 缺少参数值');
        }
        options.out = next;
        index += 1;
        break;
      case '--file':
        if (!next || next.startsWith('--')) {
          throw new Error('--file 缺少参数值');
        }
        options.file = next;
        index += 1;
        break;
      case '--dir':
        if (!next || next.startsWith('--')) {
          throw new Error('--dir 缺少参数值');
        }
        options.dir = next;
        index += 1;
        break;
      default:
        throw new Error(`未知参数: ${value}`);
    }
  }

  return options;
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

  try {
    switch (options.command) {
      case 'list': {
        if (!options.bundleDir) {
          throw new Error('缺少 --bundle-dir');
        }
        const artifacts = collectArtifacts(options.bundleDir);
        for (const artifact of artifacts) {
          console.log(
            `${artifact.kind}\t${artifact.name}\t${artifact.size}`,
          );
        }
        break;
      }
      case 'checksum': {
        if (!options.bundleDir || !options.out) {
          throw new Error('缺少 --bundle-dir 或 --out');
        }
        const artifacts = collectArtifacts(options.bundleDir);
        const lines = writeChecksums(artifacts, options.out);
        console.log(
          `已写入 ${lines.length} 个 checksum: ${options.out}`,
        );
        break;
      }
      case 'verify': {
        if (!options.file || !options.dir) {
          throw new Error('缺少 --file 或 --dir');
        }
        const result = verifyChecksums(
          readFileSync(options.file, 'utf8'),
          options.dir,
        );
        if (result.errors.length > 0) {
          for (const error of result.errors) {
            console.error(`FAIL ${error}`);
          }
          process.exit(1);
        }
        console.log(
          `checksum 校验通过（${result.checked} 个文件）`,
        );
        break;
      }
      default:
        console.error(usage());
        process.exit(2);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
