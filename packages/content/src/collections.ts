import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { collectAssets } from './assets';
import { parseDateMs } from './date';
import { ContentError } from './diagnostics';
import type { ContentDiagnostic } from './diagnostics';
import { frontmatterToPageData, readContentFile } from './frontmatter';
import { normalizeSlug, slugFromEntry } from './slug';
import { buildTaxonomy } from './taxonomy';
import type {
  ContentCollection,
  ContentCollectionKind,
  ContentEntry,
  ContentIndex,
  PageMeta,
} from './types/content';

export type LoadContentIndexOptions = {
  /** 默认 false：发布构建不包含草稿；编辑器可传 true */
  includeDrafts?: boolean;
  /** 用于生成相对 workspace 的 relativePath */
  workspaceRoot?: string;
};

function collectionKind(name: string): ContentCollectionKind {
  if (name === 'posts') return 'post';
  if (name === 'pages') return 'page';
  return 'custom';
}

function isContentFile(name: string): boolean {
  return (
    /\.(md|mdx)$/i.test(name) &&
    !name.startsWith('_') &&
    !name.startsWith('.')
  );
}

function findIndexFile(directory: string): string | undefined {
  for (const name of ['index.mdx', 'index.md']) {
    const candidate = path.join(directory, name);
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function entryId(collection: string, contentRelativePath: string): string {
  const withoutExtension = contentRelativePath.replace(/\.(md|mdx)$/i, '');
  const parts = withoutExtension.split('/');

  if (parts.at(-1) === 'index' && parts.length > 2) {
    parts.pop();
  }

  return `${collection}/${parts.slice(1).join('/')}`;
}

function createEntry(params: {
  collection: string;
  collectionKind: ContentCollectionKind;
  filePath: string;
  contentDir: string;
  workspaceRoot: string;
  isFolderEntry: boolean;
}): { entry: ContentEntry; diagnostics: ContentDiagnostic[] } {
  const {
    collection,
    collectionKind: kind,
    filePath,
    contentDir,
    workspaceRoot,
    isFolderEntry,
  } = params;

  const parsed = readContentFile(filePath);
  const contentRelativePath = toPosix(
    path.relative(contentDir, filePath),
  );
  const relativePath = toPosix(path.relative(workspaceRoot, filePath));
  const id = entryId(collection, contentRelativePath);
  const slug = parsed.frontmatter.slug
    ? normalizeSlug(parsed.frontmatter.slug)
    : slugFromEntry(contentRelativePath);
  const dateMs = parseDateMs(parsed.frontmatter.date, filePath);

  const meta: PageMeta = {
    id,
    kind: kind === 'page' ? 'page' : 'post',
    type: parsed.frontmatter.type,
    title: parsed.frontmatter.title,
    slug,
    date: parsed.frontmatter.date,
    updated: parsed.frontmatter.updated,
    description: parsed.frontmatter.description,
    tags: parsed.frontmatter.tags,
    categories: parsed.frontmatter.categories,
    draft: parsed.frontmatter.draft,
    cover: parsed.frontmatter.cover,
    data: frontmatterToPageData(parsed.frontmatter),
  };

  const assetResult = collectAssets({
    entryFilePath: filePath,
    isFolderEntry,
    cover: parsed.frontmatter.cover,
    body: parsed.body,
    workspaceRoot,
  });

  return {
    entry: {
      id,
      collection,
      meta,
      frontmatter: parsed.frontmatter,
      filePath,
      relativePath,
      body: parsed.body,
      isFolderEntry,
      assets: assetResult.assets,
      dateMs,
    },
    diagnostics: assetResult.diagnostics,
  };
}

function loadCollectionEntries(params: {
  collection: string;
  kind: ContentCollectionKind;
  collectionDir: string;
  contentDir: string;
  workspaceRoot: string;
}): { entries: ContentEntry[]; diagnostics: ContentDiagnostic[] } {
  const {
    collection,
    kind,
    collectionDir,
    contentDir,
    workspaceRoot,
  } = params;

  const entries: ContentEntry[] = [];
  const diagnostics: ContentDiagnostic[] = [];
  const seenSlugs = new Map<string, ContentEntry>();

  const dirents = readdirSync(collectionDir, {
    withFileTypes: true,
  }).sort((a, b) => a.name.localeCompare(b.name));

  for (const dirent of dirents) {
    if (dirent.name.startsWith('_') || dirent.name.startsWith('.')) {
      continue;
    }

    let filePath: string | undefined;
    let isFolderEntry = false;

    if (dirent.isFile() && isContentFile(dirent.name)) {
      filePath = path.join(collectionDir, dirent.name);
    } else if (dirent.isDirectory()) {
      filePath = findIndexFile(path.join(collectionDir, dirent.name));
      isFolderEntry = Boolean(filePath);
    }

    if (!filePath) continue;

    const created = createEntry({
      collection,
      collectionKind: kind,
      filePath,
      contentDir,
      workspaceRoot,
      isFolderEntry,
    });
    const entry = created.entry;
    diagnostics.push(...created.diagnostics);

    const previous = seenSlugs.get(entry.meta.slug);
    if (previous) {
      throw new ContentError(
        'DUPLICATE_SLUG',
        `slug "${entry.meta.slug}" 重复：${previous.relativePath} 与 ${entry.relativePath}`,
        { file: entry.filePath },
      );
    }

    seenSlugs.set(entry.meta.slug, entry);
    entries.push(entry);
  }

  return { entries, diagnostics };
}

function compareByDate(a: ContentEntry, b: ContentEntry): number {
  const aDate = a.dateMs ?? Number.NEGATIVE_INFINITY;
  const bDate = b.dateMs ?? Number.NEGATIVE_INFINITY;

  if (aDate !== bDate) return bDate - aDate;
  return a.meta.slug.localeCompare(b.meta.slug);
}

function comparePages(a: ContentEntry, b: ContentEntry): number {
  const byTitle = a.meta.title.localeCompare(
    b.meta.title,
    'zh-CN',
  );
  if (byTitle !== 0) return byTitle;
  return a.meta.slug.localeCompare(b.meta.slug);
}

export function loadContentIndex(
  contentDir: string,
  options: LoadContentIndexOptions = {},
): ContentIndex {
  const workspaceRoot = options.workspaceRoot ?? path.dirname(contentDir);

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
  const entries: ContentEntry[] = [];
  const diagnostics: ContentDiagnostic[] = [];

  for (const name of names) {
    const kind = collectionKind(name);
    const loaded = loadCollectionEntries({
      collection: name,
      kind,
      collectionDir: path.join(contentDir, name),
      contentDir,
      workspaceRoot,
    });
    diagnostics.push(...loaded.diagnostics);

    const collectionEntries = options.includeDrafts
      ? loaded.entries
      : loaded.entries.filter((entry) => !entry.meta.draft);

    collectionEntries.sort(
      kind === 'page' ? comparePages : compareByDate,
    );

    collections[name] = {
      name,
      kind,
      entries: collectionEntries,
    };
    entries.push(...collectionEntries);
  }

  entries.sort(compareByDate);

  const taxonomy = buildTaxonomy(entries);

  if (names.length === 0) {
    diagnostics.push({
      code: 'EMPTY_COLLECTION',
      severity: 'warning',
      file: contentDir,
      message: 'content 目录下没有可用的 collection',
    });
  }

  return {
    collections,
    entries,
    tags: taxonomy.tags,
    categories: taxonomy.categories,
    diagnostics,
  };
}
