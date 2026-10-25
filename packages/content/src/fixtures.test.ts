import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import {
  ContentError,
  loadContentIndex,
  loadWorkspace,
  readThemeFields,
} from './index';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

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

describe('content fixtures', () => {
  it('minimal workspace 有文章与独立页', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/minimal'),
    );

    expect(workspace.index.entries).toHaveLength(2);
    expect(workspace.index.collections.posts?.entries[0]?.meta.slug).toBe(
      'hello',
    );
    expect(workspace.index.collections.pages?.entries[0]?.meta.slug).toBe(
      'about',
    );
  });

  it('content-layer 覆盖 folder、草稿、资源、taxonomy 与主题字段', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/content-layer'),
    );
    const { index } = workspace;

    expect(index.entries).toHaveLength(4);
    expect(index.collections.posts?.entries).toHaveLength(2);
    expect(index.collections.pages?.entries).toHaveLength(1);
    expect(index.collections.projects?.entries).toHaveLength(1);

    expect(index.entries.map((entry) => entry.meta.slug)).toEqual([
      'standalone-post',
      'folder',
      'demo',
      'about',
    ]);

    const standalone = index.collections.posts?.entries[0];
    expect(standalone?.id).toBe('posts/standalone');
    expect(standalone?.meta.slug).toBe('standalone-post');
    expect(
      readThemeFields(
        standalone?.meta.data ?? {},
        'wordma-theme-default',
      ),
    ).toEqual({ featured: true });

    const folder = index.collections.posts?.entries[1];
    expect(folder?.isFolderEntry).toBe(true);
    expect(folder?.assets.map((asset) => asset.source)).toEqual([
      'content/posts/folder/cover.svg',
      'content/posts/folder/photo.svg',
    ]);
    expect(
      folder?.assets.every(
        (asset) => asset.url === asset.source && (asset.bytes ?? 0) > 0,
      ),
    ).toBe(true);

    const project = index.collections.projects?.entries[0];
    expect(project?.id).toBe('projects/demo');
    expect(project?.meta.kind).toBe('post');
    expect(project?.collection).toBe('projects');

    expect(index.tags.map((tag) => [tag.slug, tag.count])).toEqual([
      ['alpha', 2],
      ['beta', 1],
      ['project', 1],
      ['shared', 1],
    ]);
    expect(
      index.categories.map((category) => [
        category.slug,
        category.count,
      ]),
    ).toEqual([
      ['notes', 2],
      ['pages', 1],
      ['projects', 1],
    ]);

    expect(workspace.diagnostics).toEqual([]);
  });

  it('content-layer 开启 includeDrafts 后包含草稿', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/content-layer'),
      { includeDrafts: true },
    );
    const { index } = workspace;

    expect(index.entries).toHaveLength(5);
    expect(index.collections.posts?.entries).toHaveLength(3);
    expect(index.entries[0]?.meta.slug).toBe('draft');
    expect(index.tags.map((tag) => [tag.slug, tag.count])).toEqual([
      ['alpha', 3],
      ['beta', 1],
      ['draft-only', 1],
      ['project', 1],
      ['shared', 1],
    ]);
    expect(
      index.categories.map((category) => [
        category.slug,
        category.count,
      ]),
    ).toEqual([
      ['notes', 3],
      ['pages', 1],
      ['projects', 1],
    ]);
  });

  it('两次加载结果稳定', () => {
    const fixture = path.join(repoRoot, 'fixtures/content-layer');
    const first = loadWorkspace(fixture);
    const second = loadWorkspace(fixture);

    expect(first.index.entries.map((entry) => entry.id)).toEqual(
      second.index.entries.map((entry) => entry.id),
    );
    expect(first.index.tags).toEqual(second.index.tags);
    expect(first.index.categories).toEqual(
      second.index.categories,
    );
  });

  it('custom-pages 识别 projects collection', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/custom-pages'),
    );

    expect(
      workspace.index.collections.projects?.entries[0]?.meta.type,
    ).toBe('project');
  });

  it('duplicate-slug 报 DUPLICATE_SLUG', () => {
    const fixture = path.join(repoRoot, 'fixtures/broken/duplicate-slug');

    expectContentError(
      () =>
        loadContentIndex(path.join(fixture, 'content'), {
          workspaceRoot: fixture,
        }),
      'DUPLICATE_SLUG',
    );
  });

  it('invalid-date 报 INVALID_DATE', () => {
    const fixture = path.join(repoRoot, 'fixtures/broken/invalid-date');

    expectContentError(
      () =>
        loadContentIndex(path.join(fixture, 'content'), {
          workspaceRoot: fixture,
        }),
      'INVALID_DATE',
    );
  });

  it('invalid-frontmatter 报 INVALID_FRONTMATTER', () => {
    const fixture = path.join(
      repoRoot,
      'fixtures/broken/invalid-frontmatter',
    );

    expectContentError(
      () =>
        loadContentIndex(path.join(fixture, 'content'), {
          workspaceRoot: fixture,
        }),
      'INVALID_FRONTMATTER',
    );
  });
});
