import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';

export type WatchOptions = {
  root: string;
  onChange: (changed: string[]) => void;
  onError?: (error: unknown) => void;
  debounceMs?: number;
  ignored?: string[];
};

export type WatchHandle = {
  close: () => void;
};

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function isIgnored(
  changed: string,
  ignored: string[],
): boolean {
  const normalized = toPosix(changed);

  return ignored.some(
    (entry) =>
      normalized === entry ||
      normalized.startsWith(`${entry}/`) ||
      normalized.includes(`/${entry}/`),
  );
}

export function startWatch(options: WatchOptions): WatchHandle {
  const ignored = [
    '.wordma',
    'node_modules',
    '.git',
    '.DS_Store',
    ...(options.ignored ?? []),
  ];
  const debounceMs = options.debounceMs ?? 120;
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    if (changed.size === 0) return;

    const paths = [...changed].sort();
    changed.clear();
    options.onChange(paths);
  };

  let watcher: FSWatcher;
  try {
    watcher = watch(
      options.root,
      { recursive: true },
      (_event, filename) => {
        if (filename) {
          const relative = toPosix(String(filename));
          if (
            isIgnored(relative, ignored) ||
            relative.endsWith('~') ||
            relative.endsWith('.swp') ||
            relative.endsWith('.tmp')
          ) {
            return;
          }
          changed.add(relative);
        }

        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, debounceMs);
      },
    );
  } catch (error) {
    options.onError?.(error);
    return { close: () => undefined };
  }

  watcher.on('error', (error) => {
    options.onError?.(error);
  });

  return {
    close: () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      watcher.close();
    },
  };
}
