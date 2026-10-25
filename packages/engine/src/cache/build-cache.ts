import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { ENGINE_VERSION } from '../constants';

export const CACHE_FORMAT_VERSION = 1;

export type CacheStats = {
  hits: number;
  misses: number;
  disabled?: boolean;
};

export type CacheFile = {
  name: string;
  source: string;
};

export type CacheEntry = {
  dir: string;
  meta: Record<string, unknown>;
};

export type BuildCacheOptions = {
  workspaceRoot: string;
  enabled?: boolean;
};

function packageVersion(name: string): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require(`${name}/package.json`) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }

  return value;
}

function fingerprint(): Record<string, unknown> {
  return {
    format: CACHE_FORMAT_VERSION,
    engine: ENGINE_VERSION,
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    react: packageVersion('react'),
    reactDom: packageVersion('react-dom'),
    lightningcss: packageVersion('lightningcss'),
    shiki: packageVersion('shiki'),
    katex: packageVersion('katex'),
  };
}

function writeAtomic(
  filePath: string,
  content: string | Uint8Array,
): void {
  const temp = `${filePath}.tmp-${process.pid}-${Math.random()
    .toString(36)
    .slice(2)}`;

  writeFileSync(temp, content);
  rmSync(filePath, { force: true });
  renameSync(temp, filePath);
}

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function workspaceLockHash(
  workspaceRoot: string,
  hash: (value: unknown) => string,
): string {
  const files = ['bun.lock', 'bun.lockb', 'package.json'];
  const entries: Array<[string, string]> = [];

  for (const file of files) {
    const fullPath = path.join(workspaceRoot, file);
    if (!existsSync(fullPath)) continue;

    try {
      entries.push([
        file,
        createHash('sha256')
          .update(readFileSync(fullPath))
          .digest('hex'),
      ]);
    } catch {
      // ignore unreadable lock files
    }
  }

  return hash(entries);
}

export class BuildCache {
  readonly root: string;
  readonly workRoot: string;
  readonly enabled: boolean;
  readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
  };

  private readonly workspaceRoot: string;

  constructor(options: BuildCacheOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.root = path.join(
      this.workspaceRoot,
      '.wordma/cache/v1',
    );
    this.workRoot = path.join(
      this.workspaceRoot,
      '.wordma/work',
    );
    this.enabled = options.enabled !== false;

    if (!this.enabled) {
      this.stats.disabled = true;
    }

    rmSync(this.workRoot, { recursive: true, force: true });
    mkdirSync(this.workRoot, { recursive: true });

    if (this.enabled) {
      this.ensureMeta();
    }
  }

  hash(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(stableValue(value)))
      .digest('hex')
      .slice(0, 32);
  }

  workDir(namespace: string): string {
    const directory = path.join(this.workRoot, namespace);
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  lockHash(): string {
    return workspaceLockHash(this.workspaceRoot, (value) =>
      this.hash(value),
    );
  }

  getJson<T>(
    namespace: string,
    key: string,
  ): T | undefined {
    if (!this.enabled) return undefined;

    const filePath = path.join(
      this.root,
      namespace,
      `${key}.json`,
    );
    if (!existsSync(filePath)) {
      this.stats.misses += 1;
      return undefined;
    }

    const value = readJson<T>(filePath);
    if (value === undefined) {
      rmSync(filePath, { force: true });
      this.stats.misses += 1;
      return undefined;
    }

    this.stats.hits += 1;
    return value;
  }

  putJson(
    namespace: string,
    key: string,
    value: unknown,
  ): void {
    if (!this.enabled) return;

    try {
      const directory = path.join(this.root, namespace);
      mkdirSync(directory, { recursive: true });
      writeAtomic(
        path.join(directory, `${key}.json`),
        `${JSON.stringify(value)}\n`,
      );
    } catch {
      // cache failures must not break builds
    }
  }

  getEntry(
    namespace: string,
    key: string,
  ): CacheEntry | undefined {
    if (!this.enabled) return undefined;

    const dir = path.join(this.root, namespace, key);
    const meta = readJson<Record<string, unknown>>(
      path.join(dir, 'meta.json'),
    );

    if (!meta) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
      this.stats.misses += 1;
      return undefined;
    }

    this.stats.hits += 1;
    return { dir, meta };
  }

  putEntry(
    namespace: string,
    key: string,
    meta: Record<string, unknown>,
    files: CacheFile[],
  ): string | undefined {
    if (!this.enabled) return undefined;

    const parent = path.join(this.root, namespace);
    const target = path.join(parent, key);
    const temp = path.join(
      parent,
      `.tmp-${key}-${process.pid}-${Math.random()
        .toString(36)
        .slice(2)}`,
    );

    try {
      mkdirSync(temp, { recursive: true });
      for (const file of files) {
        copyFileSync(
          file.source,
          path.join(temp, file.name),
        );
      }
      writeAtomic(
        path.join(temp, 'meta.json'),
        `${JSON.stringify(meta)}\n`,
      );

      rmSync(target, { recursive: true, force: true });
      renameSync(temp, target);

      return target;
    } catch {
      rmSync(temp, { recursive: true, force: true });
      return undefined;
    }
  }

  private ensureMeta(): void {
    const metaPath = path.join(this.root, 'meta.json');
    const current = fingerprint();
    const previous = readJson<{
      fingerprint?: Record<string, unknown>;
    }>(metaPath);

    const matches =
      previous?.fingerprint &&
      JSON.stringify(stableValue(previous.fingerprint)) ===
        JSON.stringify(stableValue(current));

    if (!matches) {
      rmSync(this.root, { recursive: true, force: true });
      mkdirSync(this.root, { recursive: true });
      writeAtomic(
        metaPath,
        `${JSON.stringify({
          fingerprint: current,
        })}\n`,
      );
    }
  }
}

export function createBuildCache(
  options: BuildCacheOptions,
): BuildCache {
  return new BuildCache(options);
}
