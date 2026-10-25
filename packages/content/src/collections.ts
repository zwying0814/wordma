import { readdirSync } from 'node:fs';
import path from 'node:path';

import type {
  ContentCollection,
  ContentCollectionKind,
  ContentIndex,
} from './types/content';

export type LoadContentIndexOptions = {
  /** 默认 false：发布构建不包含草稿；编辑器可传 true */
  includeDrafts?: boolean;
};

function collectionKind(name: string): ContentCollectionKind {
  if (name === 'posts') return 'post';
  if (name === 'pages') return 'page';
  return 'custom';
}

/**
 * M1.1 只建立 collection 骨架；条目扫描与索引在 M1.3 实现。
 */
export function loadContentIndex(
  contentDir: string,
  _options: LoadContentIndexOptions = {},
): ContentIndex {
  const names = readdirSync(contentDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('_') &&
        !entry.name.startsWith('.'),
    )
    .map((entry) => entry.name)
    .sort();

  const collections: Record<string, ContentCollection> = {};
  for (const name of names) {
    collections[name] = {
      name,
      kind: collectionKind(name),
      entries: [],
    };
  }

  const diagnostics =
    names.length === 0
      ? [
          {
            code: 'EMPTY_COLLECTION',
            severity: 'warning' as const,
            file: path.join(contentDir),
            message: 'content 目录下没有可用的 collection',
          },
        ]
      : [];

  return {
    collections,
    entries: [],
    tags: [],
    categories: [],
    diagnostics,
  };
}
