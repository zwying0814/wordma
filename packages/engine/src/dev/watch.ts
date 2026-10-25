import {
  lstatSync,
  readdirSync,
  statSync,
  watch,
} from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';

export type WatchOptions = {
  root: string;
  /** workspace 之外的额外监听目录（例如外部主题） */
  additionalRoots?: string[];
  /** 绝对路径，命中后忽略 */
  ignoredPaths?: string[];
  onChange: (changed: string[]) => void;
  onError?: (error: unknown) => void;
  debounceMs?: number;
  maxWaitMs?: number;
  pollMs?: number;
};

export type WatchHandle = {
  close: () => void;
};

const IGNORED_NAMES = new Set([
  '.wordma',
  'node_modules',
  '.git',
  '.DS_Store',
]);

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function isTempFile(name: string): boolean {
  return (
    name.endsWith('~') ||
    name.endsWith('.swp') ||
    name.endsWith('.tmp')
  );
}

function createIgnoreMatcher(
  ignoredPaths: string[],
): (absolutePath: string) => boolean {
  const ignored = ignoredPaths.map((item) =>
    path.resolve(item),
  );

  return (absolutePath: string): boolean => {
    if (
      ignored.some(
        (item) =>
          absolutePath === item ||
          isInside(item, absolutePath),
      )
    ) {
      return true;
    }

    const parts = absolutePath.split(path.sep);
    if (
      parts.some((part) => IGNORED_NAMES.has(part)) ||
      isTempFile(path.basename(absolutePath))
    ) {
      return true;
    }

    return false;
  };
}

function snapshotTree(
  root: string,
  isIgnored: (absolutePath: string) => boolean,
): Map<string, string> {
  const snapshot = new Map<string, string>();
  const visited = new Set<string>();

  const walk = (directory: string): void => {
    let realDirectory: string;
    try {
      realDirectory = statSync(directory).isDirectory()
        ? directory
        : '';
    } catch {
      return;
    }
    if (!realDirectory) return;
    if (visited.has(realDirectory)) return;
    visited.add(realDirectory);

    let entries;
    try {
      entries = readdirSync(directory, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (isIgnored(fullPath)) continue;

      try {
        const lstat = lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!lstat.isFile()) continue;

        snapshot.set(
          fullPath,
          `${lstat.mtimeMs}:${lstat.size}`,
        );
      } catch {
        // file disappeared
      }
    }
  };

  walk(root);

  return snapshot;
}

export function startWatch(options: WatchOptions): WatchHandle {
  const root = path.resolve(options.root);
  const roots = [
    root,
    ...(options.additionalRoots ?? [])
      .map((item) => path.resolve(item))
      .filter((item) => !isInside(root, item)),
  ];
  const debounceMs = options.debounceMs ?? 120;
  const maxWaitMs = options.maxWaitMs ?? 500;
  const pollMs = options.pollMs ?? 500;
  const isIgnored = createIgnoreMatcher(
    options.ignoredPaths ?? [],
  );
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstChangeAt = 0;
  let watchers: FSWatcher[] = [];
  let polling: ReturnType<typeof setInterval> | undefined;
  let snapshots = new Map<string, Map<string, string>>();
  let closed = false;

  const labelFor = (
    base: string,
    absolutePath: string,
  ): string => {
    const resolved = path.resolve(absolutePath);

    return isInside(root, resolved)
      ? toPosix(path.relative(root, resolved))
      : toPosix(resolved);
  };

  const flush = (): void => {
    timer = undefined;
    firstChangeAt = 0;
    if (changed.size === 0) return;

    const paths = [...changed].sort();
    changed.clear();
    options.onChange(paths);
  };

  const schedule = (): void => {
    const now = Date.now();
    if (firstChangeAt === 0) firstChangeAt = now;

    if (timer) clearTimeout(timer);
    const wait = Math.min(
      debounceMs,
      Math.max(0, maxWaitMs - (now - firstChangeAt)),
    );
    timer = setTimeout(flush, wait);
  };

  const record = (
    base: string,
    absolutePath: string,
  ): void => {
    if (closed) return;
    const resolved = path.resolve(absolutePath);
    if (isIgnored(resolved)) return;

    try {
      if (lstatSync(resolved).isDirectory()) return;
    } catch {
      // 删除事件继续记录
    }

    changed.add(labelFor(base, resolved));
    schedule();
  };

  const startPolling = (): void => {
    if (polling || closed) return;

    snapshots = new Map(
      roots.map((item) => [
        item,
        snapshotTree(item, isIgnored),
      ]),
    );

    polling = setInterval(() => {
      for (const item of roots) {
        const next = snapshotTree(item, isIgnored);
        const previous = snapshots.get(item) ?? new Map();

        for (const [file, stamp] of next) {
          if (previous.get(file) !== stamp) {
            record(item, file);
          }
        }
        for (const file of previous.keys()) {
          if (!next.has(file)) {
            record(item, file);
          }
        }

        snapshots.set(item, next);
      }
    }, pollMs);
  };

  try {
    for (const item of roots) {
      watchers.push(
        watch(
          item,
          { recursive: true },
          (_event, filename) => {
            if (!filename) {
              record(item, item);
              return;
            }
            record(item, path.resolve(item, String(filename)));
          },
        ),
      );
    }

    for (const watcher of watchers) {
      watcher.on('error', (error) => {
        options.onError?.(error);
        for (const item of watchers) item.close();
        watchers = [];
        startPolling();
      });
    }
  } catch (error) {
    options.onError?.(error);
    for (const watcher of watchers) watcher.close();
    watchers = [];
    startPolling();
  }

  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      for (const watcher of watchers) watcher.close();
      watchers = [];
      if (polling) {
        clearInterval(polling);
        polling = undefined;
      }
      snapshots.clear();
    },
  };
}
