import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Diagnostic } from '../diagnostics';
import { inspectThemeDirectory } from './manifest';
import { defaultThemeDirectory } from './resolve';

export type ThemeSource =
  | 'workspace'
  | 'dependency'
  | 'builtin';

export type ThemeListItem = {
  id: string;
  displayName: string;
  version: string;
  path: string;
  source: ThemeSource;
  compatible: boolean;
  diagnostics: Diagnostic[];
};

type Candidate = {
  directory: string;
  source: ThemeSource;
};

const SOURCE_ORDER: Record<ThemeSource, number> = {
  workspace: 0,
  dependency: 1,
  builtin: 2,
};

function isThemeDirectory(directory: string): boolean {
  return existsSync(path.join(directory, 'theme.yaml'));
}

function addThemeCandidate(
  candidates: Candidate[],
  directory: string,
  source: ThemeSource,
): void {
  if (isThemeDirectory(directory)) {
    candidates.push({ directory, source });
  }
}

function scanThemeDirectory(
  base: string,
  source: ThemeSource,
  candidates: Candidate[],
): void {
  let entries;
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const directory = path.join(base, entry.name);

    if (entry.name.startsWith('@')) {
      let scoped;
      try {
        scoped = readdirSync(directory, {
          withFileTypes: true,
        });
      } catch {
        continue;
      }

      for (const child of scoped) {
        if (!child.isDirectory() && !child.isSymbolicLink()) {
          continue;
        }
        addThemeCandidate(
          candidates,
          path.join(directory, child.name),
          source,
        );
      }
      continue;
    }

    addThemeCandidate(candidates, directory, source);
  }
}

/**
 * 列出工作区、依赖与内置主题。
 *
 * 同名主题按 workspace > node_modules > builtin 去重。
 */
export function listThemes(rootInput: string): ThemeListItem[] {
  const root = path.resolve(rootInput);
  const candidates: Candidate[] = [];

  scanThemeDirectory(
    path.join(root, 'themes'),
    'workspace',
    candidates,
  );
  scanThemeDirectory(
    path.join(root, 'node_modules'),
    'dependency',
    candidates,
  );
  const builtin = defaultThemeDirectory();
  if (builtin) {
    addThemeCandidate(candidates, builtin, 'builtin');
  }

  const themes = new Map<string, ThemeListItem>();

  for (const candidate of candidates) {
    const inspection = inspectThemeDirectory(
      candidate.directory,
    );
    const id =
      inspection.manifest?.id ??
      path.basename(candidate.directory);

    if (themes.has(id)) continue;

    themes.set(id, {
      id,
      displayName:
        inspection.manifest?.displayName ?? id,
      version: inspection.manifest?.version ?? '0.0.0',
      path:
        path.relative(root, candidate.directory) || '.',
      source: candidate.source,
      compatible:
        inspection.manifest !== undefined &&
        !inspection.diagnostics.some(
          (diagnostic) => diagnostic.severity === 'error',
        ),
      diagnostics: inspection.diagnostics,
    });
  }

  return [...themes.values()].sort((a, b) => {
    const source =
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    return source !== 0
      ? source
      : a.displayName.localeCompare(b.displayName);
  });
}
