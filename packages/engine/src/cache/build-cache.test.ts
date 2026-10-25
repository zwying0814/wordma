import { describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildSite } from '../build';
import {
  BuildCache,
  createBuildCache,
} from './build-cache';

function makeWorkspace(options: {
  islands?: boolean;
} = {}): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-cache-ws-'),
  );
  const write = (relative: string, source: string): void => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  };

  write(
    'wordma.site.yaml',
    [
      'site:',
      '  title: Cache Site',
      'theme:',
      '  id: wordma-theme-default',
    ].join('\n'),
  );
  write(
    'package.json',
    JSON.stringify({
      name: 'cache-fixture',
      private: true,
      type: 'module',
    }),
  );
  write(
    'content/posts/a.mdx',
    '---\ntitle: A\ndate: 2026-10-25\n---\n\n# A\n\nAlpha.',
  );
  write(
    'content/posts/b.mdx',
    '---\ntitle: B\ndate: 2026-10-24\n---\n\n# B\n\nBeta.',
  );

  if (options.islands) {
    write(
      'components/counter.tsx',
      [
        "import { useState } from 'react';",
        "import './counter.module.css';",
        'export default function Counter() {',
        '  const [value] = useState(1);',
        '  return <span>counter-v1-{value}</span>;',
        '}',
      ].join('\n'),
    );
    write(
      'components/counter.module.css',
      '.box { color: red; }',
    );
    write(
      'content/posts/island.mdx',
      [
        '---',
        'title: Island',
        'date: 2026-10-23',
        '---',
        '',
        "import Counter from '../../components/counter';",
        '',
        '<Counter />',
      ].join('\n'),
    );
  }

  return root;
}

function outDir(root: string, name: string): string {
  return path.join(root, `.out-${name}`);
}

describe('build cache', () => {
  it('warm build 命中 MDX 与主题 CSS', async () => {
    const root = makeWorkspace();

    try {
      const first = await buildSite({
        root,
        outDir: outDir(root, 'one'),
      });
      const second = await buildSite({
        root,
        outDir: outDir(root, 'two'),
      });

      expect(first.cache.hits).toBe(0);
      expect(first.cache.misses).toBeGreaterThan(0);
      expect(second.cache.misses).toBe(0);
      expect(second.cache.hits).toBeGreaterThan(0);

      const a = readFileSync(
        path.join(
          outDir(root, 'two'),
          'posts/a/index.html',
        ),
        'utf8',
      );
      expect(a).toContain('Alpha.');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--no-cache 不读不写缓存', async () => {
    const root = makeWorkspace();

    try {
      const result = await buildSite({
        root,
        outDir: outDir(root, 'no-cache'),
        cache: false,
      });

      expect(result.cache.disabled).toBe(true);
      expect(result.cache.hits).toBe(0);
      expect(result.cache.misses).toBe(0);
      expect(
        existsSync(
          path.join(root, '.wordma/cache/v1/mdx'),
        ),
      ).toBe(false);
      expect(
        existsSync(
          path.join(
            outDir(root, 'no-cache'),
            'posts/a/index.html',
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('正文变化只失效对应 MDX，site 标题变化仍可复用 MDX', async () => {
    const root = makeWorkspace();

    try {
      await buildSite({ root, outDir: outDir(root, 'warm') });
      writeFileSync(
        path.join(root, 'content/posts/a.mdx'),
        '---\ntitle: A\ndate: 2026-10-25\n---\n\n# A\n\nAlpha updated.',
      );

      const changed = await buildSite({
        root,
        outDir: outDir(root, 'changed'),
      });

      expect(changed.cache.misses).toBeGreaterThanOrEqual(1);
      expect(
        readFileSync(
          path.join(
            outDir(root, 'changed'),
            'posts/a/index.html',
          ),
          'utf8',
        ),
      ).toContain('Alpha updated.');

      const siteYaml = path.join(
        root,
        'wordma.site.yaml',
      );
      writeFileSync(
        siteYaml,
        readFileSync(siteYaml, 'utf8').replace(
          'Cache Site',
          'Cache Site Renamed',
        ),
      );
      const renamed = await buildSite({
        root,
        outDir: outDir(root, 'renamed'),
      });

      expect(renamed.cache.hits).toBeGreaterThan(0);
      expect(
        readFileSync(
          path.join(
            outDir(root, 'renamed'),
            'posts/a/index.html',
          ),
          'utf8',
        ),
      ).toContain('Cache Site Renamed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('组件变化使岛屿与 MDX 失效', async () => {
    const root = makeWorkspace({ islands: true });

    try {
      await buildSite({
        root,
        outDir: outDir(root, 'first'),
      });
      const warm = await buildSite({
        root,
        outDir: outDir(root, 'warm'),
      });
      expect(warm.cache.hits).toBeGreaterThan(0);

      const firstHtml = readFileSync(
        path.join(
          outDir(root, 'warm'),
          'posts/island/index.html',
        ),
        'utf8',
      );
      const firstSrc =
        /data-wordma-src="([^"]+)"/.exec(
          firstHtml,
        )?.[1];
      expect(firstSrc).toBeDefined();

      writeFileSync(
        path.join(root, 'components/counter.tsx'),
        [
          "import { useState } from 'react';",
          "import './counter.module.css';",
          'export default function Counter() {',
          '  const [value] = useState(2);',
          '  return <span>counter-v2-{value}</span>;',
          '}',
        ].join('\n'),
      );

      await buildSite({
        root,
        outDir: outDir(root, 'changed'),
      });

      const changedHtml = readFileSync(
        path.join(
          outDir(root, 'changed'),
          'posts/island/index.html',
        ),
        'utf8',
      );
      const changedSrc =
        /data-wordma-src="([^"]+)"/.exec(
          changedHtml,
        )?.[1];

      expect(changedSrc).toBeDefined();
      expect(changedSrc).not.toBe(firstSrc);

      const jsFile = path.basename(
        changedSrc ?? '',
      );
      const js = readFileSync(
        path.join(
          outDir(root, 'changed'),
          'assets/islands',
          jsFile,
        ),
        'utf8',
      );
      expect(js).toContain('counter-v2-');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('basePath 与 lock 变化触发相应失效', async () => {
    const root = makeWorkspace({ islands: true });

    try {
      await buildSite({
        root,
        outDir: outDir(root, 'base'),
      });

      const siteYaml = path.join(
        root,
        'wordma.site.yaml',
      );
      writeFileSync(
        siteYaml,
        readFileSync(siteYaml, 'utf8').replace(
          '  title: Cache Site',
          '  title: Cache Site\n  basePath: /docs',
        ),
      );
      const based = await buildSite({
        root,
        outDir: outDir(root, 'based'),
      });

      expect(based.cache.misses).toBeGreaterThan(0);
      expect(
        readFileSync(
          path.join(
            outDir(root, 'based'),
            'posts/a/index.html',
          ),
          'utf8',
        ),
      ).toContain('/docs/assets/css/theme-');

      writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          name: 'cache-fixture',
          private: true,
          type: 'module',
          dependencies: { react: '^19.3.1' },
        }),
      );
      const locked = await buildSite({
        root,
        outDir: outDir(root, 'locked'),
      });

      expect(locked.cache.misses).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('BuildCache', () => {
  it('损坏 JSON 按 miss 处理并删除', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-cache-unit-'),
    );

    try {
      const cache = createBuildCache({
        workspaceRoot: root,
      });
      cache.putJson('mdx', 'key', { html: 'ok' });
      expect(cache.getJson('mdx', 'key')).toEqual({
        html: 'ok',
      });

      const file = path.join(
        root,
        '.wordma/cache/v1/mdx/key.json',
      );
      writeFileSync(file, '{broken');

      expect(cache.getJson('mdx', 'key')).toBeUndefined();
      expect(existsSync(file)).toBe(false);
      expect(cache.stats.misses).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('损坏 entry meta 删除整个条目', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-cache-unit-'),
    );

    try {
      const cache = createBuildCache({
        workspaceRoot: root,
      });
      const source = path.join(root, 'a.txt');
      writeFileSync(source, 'asset');

      cache.putEntry(
        'islands',
        'entry',
        { name: 'a.txt' },
        [{ name: 'a.txt', source }],
      );
      expect(cache.getEntry('islands', 'entry')).toBeDefined();

      const dir = path.join(
        root,
        '.wordma/cache/v1/islands/entry',
      );
      writeFileSync(
        path.join(dir, 'meta.json'),
        'broken',
      );

      expect(cache.getEntry('islands', 'entry')).toBeUndefined();
      expect(existsSync(dir)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('disabled 时不创建持久缓存', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'wordma-cache-unit-'),
    );

    try {
      const cache = new BuildCache({
        workspaceRoot: root,
        enabled: false,
      });

      expect(cache.stats.disabled).toBe(true);
      expect(
        existsSync(
          path.join(root, '.wordma/cache/v1'),
        ),
      ).toBe(false);

      cache.putJson('mdx', 'key', { ok: true });
      expect(cache.getJson('mdx', 'key')).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
