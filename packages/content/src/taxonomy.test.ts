import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadContentIndex } from './index';

function makeRoot(prefix = 'wordma-taxonomy-'): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(root, 'content/posts'), { recursive: true });
  return root;
}

function writePost(
  root: string,
  name: string,
  frontmatter: string,
): void {
  writeFileSync(
    path.join(root, 'content/posts', name),
    `---\n${frontmatter}\n---\nBody\n`,
  );
}

describe('drafts', () => {
  it('默认排除草稿，includeDrafts 时包含', () => {
    const root = makeRoot();
    writePost(
      root,
      'published.mdx',
      [
        'title: Published',
        'date: 2026-01-01',
        'tags:',
        '  - design',
        'categories:',
        '  - notes',
      ].join('\n'),
    );
    writePost(
      root,
      'draft.mdx',
      [
        'title: Draft',
        'date: 2026-02-01',
        'draft: true',
        'tags:',
        '  - design',
        'categories:',
        '  - notes',
      ].join('\n'),
    );

    try {
      const published = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      expect(published.entries).toHaveLength(1);
      expect(published.collections.posts?.entries).toHaveLength(1);
      expect(published.tags).toEqual([
        { name: 'design', slug: 'design', count: 1 },
      ]);
      expect(published.categories).toEqual([
        { name: 'notes', slug: 'notes', count: 1 },
      ]);

      const all = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
        includeDrafts: true,
      });
      expect(all.entries).toHaveLength(2);
      expect(all.tags).toEqual([
        { name: 'design', slug: 'design', count: 2 },
      ]);
      expect(all.categories).toEqual([
        { name: 'notes', slug: 'notes', count: 2 },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('taxonomy', () => {
  it('去重、归一化、计数并排序', () => {
    const root = makeRoot();
    writePost(
      root,
      'one.mdx',
      [
        'title: One',
        'date: 2026-01-02',
        'tags:',
        '  - Design',
        '  - design',
        '  - Hello World',
        'categories:',
        '  - Notes',
        '  - notes',
      ].join('\n'),
    );
    writePost(
      root,
      'two.mdx',
      [
        'title: Two',
        'date: 2026-01-01',
        'tags:',
        '  - design',
        'categories:',
        '  - notes',
        '  - " "',
      ].join('\n'),
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });

      expect(index.tags.map((tag) => [tag.slug, tag.count])).toEqual([
        ['design', 2],
        ['hello-world', 1],
      ]);
      expect(index.categories.map((category) => [category.slug, category.count])).toEqual([
        ['notes', 2],
      ]);
      expect(index.tags[0]?.name).toBe('Design');
      expect(index.tags[0]?.url).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
