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

function makeRoot(prefix = 'wordma-assets-'): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(root, 'content/posts'), { recursive: true });
  return root;
}

function writeFile(filePath: string, content = 'asset'): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function writeEntry(
  filePath: string,
  frontmatter: string,
  body = '',
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `---\n${frontmatter}\n---\n${body}\n`);
}

describe('asset discovery', () => {
  it('发现 folder entry 目录资源、cover 与正文图片', () => {
    const root = makeRoot();
    const folder = path.join(root, 'content/posts/folder');

    writeEntry(
      path.join(folder, 'index.mdx'),
      'title: Folder\ncover: cover.svg',
      [
        '![pic](./pic.png)',
        '<img src="other.png" alt="other" />',
        '![external](https://example.com/x.png)',
        '![public](/public/y.png)',
      ].join('\n'),
    );
    writeFile(path.join(folder, 'cover.svg'));
    writeFile(path.join(folder, 'pic.png'));
    writeFile(path.join(folder, 'other.png'));
    writeFile(path.join(folder, 'notes.txt'));
    writeFile(path.join(folder, 'assets/nested.png'));

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      const entry = index.collections.posts?.entries[0];

      expect(entry?.assets.map((asset) => asset.source)).toEqual([
        'content/posts/folder/assets/nested.png',
        'content/posts/folder/cover.svg',
        'content/posts/folder/notes.txt',
        'content/posts/folder/other.png',
        'content/posts/folder/pic.png',
      ]);
      expect(
        entry?.assets.every(
          (asset) => asset.url === asset.source && (asset.bytes ?? 0) > 0,
        ),
      ).toBe(true);
      expect(
        index.diagnostics.some(
          (diagnostic) => diagnostic.code === 'MISSING_ASSET',
        ),
      ).toBe(false);
      expect(
        entry?.assets.some((asset) => asset.source.endsWith('index.mdx')),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('cover 不存在时给出 MISSING_ASSET 警告', () => {
    const root = makeRoot();
    writeEntry(
      path.join(root, 'content/posts/folder/index.mdx'),
      'title: Folder\ncover: missing.png',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      const entry = index.collections.posts?.entries[0];

      expect(entry?.assets).toEqual([]);
      expect(
        index.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'MISSING_ASSET' &&
            diagnostic.path === 'missing.png' &&
            diagnostic.file?.endsWith('index.mdx'),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('发现 Markdown 与 HTML 链接资源', () => {
    const root = makeRoot();
    writeEntry(
      path.join(root, 'content/posts/links.mdx'),
      'title: Links',
      [
        '[doc](./doc.pdf)',
        '<a href="./guide.pdf">guide</a>',
        '[external](https://example.com/x)',
      ].join('\n'),
    );
    writeFile(path.join(root, 'content/posts/doc.pdf'));
    writeFile(path.join(root, 'content/posts/guide.pdf'));

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      const entry = index.collections.posts?.entries[0];

      expect(entry?.assets.map((asset) => asset.source)).toEqual([
        'content/posts/doc.pdf',
        'content/posts/guide.pdf',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('standalone entry 的正文图片相对 collection 目录解析', () => {
    const root = makeRoot();
    writeEntry(
      path.join(root, 'content/posts/hello.mdx'),
      'title: Hello',
      '![pic](./pic.png)',
    );
    writeFile(path.join(root, 'content/posts/pic.png'));

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      const entry = index.collections.posts?.entries[0];

      expect(entry?.assets).toEqual([
        {
          source: 'content/posts/pic.png',
          url: 'content/posts/pic.png',
          bytes: 5,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('忽略外部、绝对与 data URL', () => {
    const root = makeRoot();
    writeEntry(
      path.join(root, 'content/posts/external.mdx'),
      'title: External',
      [
        '![a](https://example.com/a.png)',
        '![b](/public/b.png)',
        '![c](data:image/png;base64,xxxx)',
        '![d](#anchor)',
      ].join('\n'),
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });
      const entry = index.collections.posts?.entries[0];

      expect(entry?.assets).toEqual([]);
      expect(index.diagnostics).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('正文图片不存在时给出 MISSING_ASSET', () => {
    const root = makeRoot();
    writeEntry(
      path.join(root, 'content/posts/missing.mdx'),
      'title: Missing',
      '![x](./missing.png)',
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });

      expect(
        index.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'MISSING_ASSET' &&
            diagnostic.path === './missing.png',
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('资源路径逃出工作区时给出 UNSAFE_ASSET', () => {
    const root = makeRoot();
    const outside = mkdtempSync(path.join(tmpdir(), 'wordma-outside-'));
    const folder = path.join(root, 'content/posts/folder');
    const outsideFile = path.join(outside, 'secret.png');
    writeFile(outsideFile);

    const relativePath = path
      .relative(folder, outsideFile)
      .split(path.sep)
      .join('/');

    writeEntry(
      path.join(folder, 'index.mdx'),
      'title: Folder',
      `![x](${relativePath})`,
    );

    try {
      const index = loadContentIndex(path.join(root, 'content'), {
        workspaceRoot: root,
      });

      expect(
        index.diagnostics.some(
          (diagnostic) => diagnostic.code === 'UNSAFE_ASSET',
        ),
      ).toBe(true);
      expect(index.collections.posts?.entries[0]?.assets).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
