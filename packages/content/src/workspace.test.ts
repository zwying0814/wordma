import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ContentError, loadWorkspace } from './index';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

function makeTempDir(prefix = 'wordma-ws-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeSite(root: string): void {
  writeFileSync(
    path.join(root, 'wordma.site.yaml'),
    'site:\n  title: Test Workspace\n',
  );
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

describe('loadWorkspace', () => {
  it('加载 minimal fixture', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/minimal'),
    );

    expect(workspace.site.site.title).toBe('Minimal Wordma Site');
    expect(workspace.contentDir).toBe(
      path.join(workspace.root, 'content'),
    );
    expect(Object.keys(workspace.index.collections)).toEqual([
      'pages',
      'posts',
    ]);
    expect(workspace.index.collections.posts?.kind).toBe('post');
    expect(workspace.index.collections.pages?.kind).toBe('page');
    expect(workspace.packageJson?.name).toBe('wordma-fixture-minimal');
  });

  it('识别自定义 collection', () => {
    const workspace = loadWorkspace(
      path.join(repoRoot, 'fixtures/custom-pages'),
    );

    expect(Object.keys(workspace.index.collections)).toEqual([
      'pages',
      'projects',
    ]);
    expect(workspace.index.collections.projects?.kind).toBe('custom');
  });

  it('缺少站点配置时报 MISSING_SITE_CONFIG', () => {
    const root = makeTempDir();

    try {
      expectContentError(
        () => loadWorkspace(root),
        'MISSING_SITE_CONFIG',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('缺少 content 目录时报 MISSING_CONTENT_DIR', () => {
    const root = makeTempDir();
    writeSite(root);

    try {
      expectContentError(
        () => loadWorkspace(root),
        'MISSING_CONTENT_DIR',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('content 不是目录时报 INVALID_CONTENT_DIR', () => {
    const root = makeTempDir();
    writeSite(root);
    writeFileSync(path.join(root, 'content'), 'not a directory');

    try {
      expectContentError(
        () => loadWorkspace(root),
        'INVALID_CONTENT_DIR',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('空 content 返回空索引与警告', () => {
    const root = makeTempDir();
    writeSite(root);
    mkdirSync(path.join(root, 'content'));

    try {
      const workspace = loadWorkspace(root);
      expect(workspace.index.collections).toEqual({});
      expect(
        workspace.index.diagnostics.some(
          (diagnostic) => diagnostic.code === 'EMPTY_COLLECTION',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('忽略隐藏目录和下划线目录', () => {
    const root = makeTempDir();
    writeSite(root);
    mkdirSync(path.join(root, 'content/posts'), { recursive: true });
    mkdirSync(path.join(root, 'content/_drafts'));
    mkdirSync(path.join(root, 'content/.hidden'));

    try {
      const workspace = loadWorkspace(root);
      expect(Object.keys(workspace.index.collections)).toEqual(['posts']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('package.json 损坏时给出警告但不阻塞', () => {
    const root = makeTempDir();
    writeSite(root);
    mkdirSync(path.join(root, 'content/posts'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), '{ invalid json');

    try {
      const workspace = loadWorkspace(root);
      expect(workspace.packageJson).toBeUndefined();
      expect(
        workspace.diagnostics.some(
          (diagnostic) => diagnostic.code === 'INVALID_PACKAGE_JSON',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('工作区是文件时报 INVALID_WORKSPACE', () => {
    const root = makeTempDir();
    const file = path.join(root, 'not-a-directory');
    writeFileSync(file, 'x');

    try {
      expectContentError(
        () => loadWorkspace(file),
        'INVALID_WORKSPACE',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('content 符号链接逃出工作区时报 UNSAFE_PATH', () => {
    if (process.platform === 'win32') return;

    const root = makeTempDir();
    const outside = makeTempDir('wordma-outside-');
    writeSite(root);
    mkdirSync(path.join(outside, 'content'));
    symlinkSync(
      path.join(outside, 'content'),
      path.join(root, 'content'),
      'dir',
    );

    try {
      expectContentError(
        () => loadWorkspace(root),
        'UNSAFE_PATH',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
