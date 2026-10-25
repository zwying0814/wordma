import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ContentError,
  loadContentIndex,
  readThemeFields,
} from './index';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

function makeTempRoot(prefix = 'wordma-index-'): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(root, 'content'), { recursive: true });
  return root;
}

function writeContent(filePath: string, frontmatter: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `---\n${frontmatter}\n---\nBody\n`);
}

function expectContentError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    expect((error as ContentError).code).toBe(code);
    return;
  }

  throw new Error(`预期抛出 ContentError(${code})`);
}

describe('loadContentIndex', () => {
  it('索引 minimal fixture', () => {
    const fixture = path.join(repoRoot, 'fixtures/minimal');
    const index = loadContentIndex(path.join(fixture, 'content'), {
      workspaceRoot: fixture,
    });

    expect(Object.keys(index.collections)).toEqual(['pages', 'posts']);
    expect(index.entries).toHaveLength(2);

    const post = index.collections.posts?.entries[0];
    expect(post?.id).toBe('posts/hello');
    expect(post?.collection).toBe('posts');
    expect(post?.meta.kind).toBe('post');
    expect(post?.meta.title).toBe('Hello Wordma');
    expect(post?.meta.slug).toBe('hello');
    expect(post?.relativePath).toBe('content/posts/hello.mdx');
    expect(post?.isFolderEntry).toBe(false);
    expect(post?.body).toContain('# Hello Wordma');
    expect(post?.dateMs).toBe(Date.UTC(2026, 9, 25));

    const page = index.collections.pages?.entries[0];
    expect(page?.meta.kind).toBe('page');
    expect(page?.meta.slug).toBe('about');
  });

  it('索引自定义 collection 与主题字段', () => {
    const fixture = path.join(repoRoot, 'fixtures/custom-pages');
    const index = loadContentIndex(path.join(fixture, 'content'), {
      workspaceRoot: fixture,
    });

    const project = index.collections.projects?.entries[0];
    expect(project?.id).toBe('projects/demo');
    expect(project?.meta.kind).toBe('post');
    expect(project?.meta.type).toBe('project');
    expect(
      readThemeFields(
        project?.meta.data ?? {},
        'wordma-theme-custom-pages',
      ),
    ).toEqual({
      repo: 'https://example.com/demo',
      status: 'active',
    });

    const about = index.collections.pages?.entries[0];
    expect(about?.meta.type).toBe('about');
  });

  it('保留多个主题命名空间', () => {
    const fixture = path.join(repoRoot, 'fixtures/theme-switch');
    const index = loadContentIndex(path.join(fixture, 'content'), {
      workspaceRoot: fixture,
    });

    const post = index.collections.posts?.entries[0];
    expect(Object.keys(post?.frontmatter.theme ?? {})).toEqual([
      'wordma-theme-journal',
      'wordma-theme-minimal',
    ]);
    expect(
      readThemeFields(post?.meta.data ?? {}, 'wordma-theme-minimal'),
    ).toEqual({ compact: true });
  });

  it('重复 slug 报 DUPLICATE_SLUG', () => {
    const fixture = path.join(repoRoot, 'fixtures/broken/duplicate-slug');

    expectContentError(
      () =>
        loadContentIndex(path.join(fixture, 'content'), {
          workspaceRoot: fixture,
        }),
      'DUPLICATE_SLUG',
    );
  });

  it('支持 folder entry 和 .md', () => {
    const root = makeTempRoot();
    writeContent(
      path.join(root, 'content/posts/folder/index.mdx'),
      'title: Folder Post\ndate: 2026-01-01',
    );
    writeContent(
      path.join(root, 'content/pages/about.md'),
      'title: About',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });

      const post = index.collections.posts?.entries[0];
      expect(post?.id).toBe('posts/folder');
      expect(post?.meta.slug).toBe('folder');
      expect(post?.isFolderEntry).toBe(true);
      expect(post?.relativePath).toBe(
        'content/posts/folder/index.mdx',
      );

      const page = index.collections.pages?.entries[0];
      expect(page?.id).toBe('pages/about');
      expect(page?.meta.kind).toBe('page');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('按日期倒序，无日期排最后', () => {
    const root = makeTempRoot();
    writeContent(
      path.join(root, 'content/posts/a.mdx'),
      'title: A\ndate: 2026-01-01',
    );
    writeContent(
      path.join(root, 'content/posts/b.mdx'),
      'title: B\ndate: 2026-02-01',
    );
    writeContent(
      path.join(root, 'content/posts/c.mdx'),
      'title: C',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });

      expect(
        index.collections.posts?.entries.map((entry) => entry.meta.slug),
      ).toEqual(['b', 'a', 'c']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pages 按标题排序', () => {
    const root = makeTempRoot();
    writeContent(
      path.join(root, 'content/pages/z.md'),
      'title: Zebra',
    );
    writeContent(
      path.join(root, 'content/pages/a.md'),
      'title: Alpha',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });

      expect(
        index.collections.pages?.entries.map((entry) => entry.meta.title),
      ).toEqual(['Alpha', 'Zebra']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('folder entry 与 standalone 同 slug 时报错', () => {
    const root = makeTempRoot();
    writeContent(
      path.join(root, 'content/posts/hello.mdx'),
      'title: Hello',
    );
    writeContent(
      path.join(root, 'content/posts/hello/index.mdx'),
      'title: Hello Folder',
    );

    try {
      expectContentError(
        () =>
          loadContentIndex(path.join(root, 'content'), {
            workspaceRoot: root,
          }),
        'DUPLICATE_SLUG',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('非法日期报 INVALID_DATE', () => {
    const root = makeTempRoot();
    writeContent(
      path.join(root, 'content/posts/bad.mdx'),
      'title: Bad\ndate: 2026-02-31',
    );

    try {
      expectContentError(
        () =>
          loadContentIndex(path.join(root, 'content'), {
            workspaceRoot: root,
          }),
        'INVALID_DATE',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('忽略非内容文件', () => {
    const root = makeTempRoot();
    mkdirSync(path.join(root, 'content/posts'), { recursive: true });
    writeFileSync(
      path.join(root, 'content/posts/notes.txt'),
      'not content',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      expect(index.collections.posts?.entries).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('frontmatter slug 会被归一化', () => {
    const root = makeTempRoot();
    writeContent(
      path.join(root, 'content/posts/hello.mdx'),
      'title: Hello\nslug: Hello World',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      expect(index.collections.posts?.entries[0]?.meta.slug).toBe(
        'hello-world',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
