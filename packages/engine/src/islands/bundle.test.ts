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

import { IslandError } from '../errors';
import { analyzeMdx } from '../mdx/compile';
import {
  buildIslandBundles,
  collectIslandInputs,
  containsBundledReact,
  copyIslandAssets,
} from './bundle';
import type { IslandBuildResult } from './bundle';
import type { IslandReference } from './analyze';

function makeRoot(): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-island-'),
  );
  mkdirSync(path.join(root, 'content/posts'), {
    recursive: true,
  });
  mkdirSync(path.join(root, 'components'), {
    recursive: true,
  });

  return root;
}

function writeFile(
  root: string,
  relativePath: string,
  source: string,
): void {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function references(
  root: string,
  body: string,
): IslandReference[] {
  const filePath = path.join(
    root,
    'content/posts/test.mdx',
  );

  return analyzeMdx(body, {
    filePath,
    workspaceRoot: root,
  }).references;
}

async function build(
  root: string,
  refs: IslandReference[],
  overrides: {
    basePath?: string;
    cacheName?: string;
  } = {},
): Promise<IslandBuildResult> {
  return buildIslandBundles(collectIslandInputs(refs), {
    workspaceRoot: root,
    cacheDir: path.join(
      root,
      '.cache',
      overrides.cacheName ?? 'islands',
    ),
    basePath: overrides.basePath,
  });
}

function expectIslandError(
  error: unknown,
  code: string,
): IslandError {
  expect(error).toBeInstanceOf(IslandError);
  expect((error as IslandError).code).toBe(code);
  return error as IslandError;
}

async function expectBuildIslandError(
  root: string,
  refs: IslandReference[],
  code: string,
): Promise<IslandError> {
  try {
    await build(root, refs);
  } catch (error) {
    return expectIslandError(error, code);
  }

  throw new Error(`预期 IslandError(${code})`);
}

describe('buildIslandBundles', () => {
  it('打包两个岛屿并按来源与导出名去重', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/counter.tsx',
        [
          "import { useState } from 'react';",
          'export default function Counter() {',
          '  const [n, setN] = useState(0);',
          '  return <button onClick={() => setN(n + 1)}>{n}</button>;',
          '}',
        ].join('\n'),
      );
      writeFile(
        root,
        'components/note.tsx',
        'export default function Note() { return <aside>note</aside>; }\n',
      );

      const refs = references(
        root,
        [
          "import Counter from '../../components/counter';",
          "import Note from '../../components/note';",
          '',
          '<Counter />',
          '<Note />',
          '<Counter />',
        ].join('\n'),
      );

      expect(refs).toHaveLength(3);

      const result = await build(root, refs);

      expect(result.bundles).toHaveLength(2);
      expect(result.assets.size).toBe(2);
      expect(
        result.bundles.map((item) => item.name),
      ).toEqual(['Counter', 'Note']);

      for (const bundle of result.bundles) {
        expect(existsSync(bundle.jsPath)).toBe(true);
        expect(bundle.js).toStartWith(
          '/assets/islands/island-',
        );
        expect(bundle.bytes).toBeGreaterThan(0);
      }

      const counter = result.bundles.find(
        (item) => item.name === 'Counter',
      );
      if (!counter) throw new Error('缺少 Counter bundle');
      const js = readFileSync(counter.jsPath, 'utf8');

      expect(js).toContain('from"react"');
      expect(js).toContain('useState');
      expect(containsBundledReact(js)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('props 不同不会重复打包', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/counter.tsx',
        'export default function Counter() { return <span>c</span>; }\n',
      );

      const refs = references(
        root,
        [
          "import Counter from '../../components/counter';",
          '',
          '<Counter start={1} />',
          '<Counter start={2} />',
        ].join('\n'),
      );

      expect(refs).toHaveLength(2);
      const result = await build(root, refs);

      expect(result.bundles).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('打包相对 import 与 workspace 依赖', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/helper.ts',
        "export const marker = 'relative-helper';\n",
      );
      writeFile(
        root,
        'node_modules/tiny/package.json',
        JSON.stringify({
          name: 'tiny',
          version: '1.0.0',
          type: 'module',
          main: 'index.js',
        }),
      );
      writeFile(
        root,
        'node_modules/tiny/index.js',
        "export const packageMarker = 'tiny-package';\n",
      );
      writeFile(
        root,
        'components/fancy.tsx',
        [
          "import { marker } from './helper';",
          "import { packageMarker } from 'tiny';",
          'export default function Fancy() {',
          '  return <div>{marker}{packageMarker}</div>;',
          '}',
        ].join('\n'),
      );

      const refs = references(
        root,
        [
          "import Fancy from '../../components/fancy';",
          '',
          '<Fancy />',
        ].join('\n'),
      );
      const result = await build(root, refs);
      const js = readFileSync(
        result.bundles[0]!.jsPath,
        'utf8',
      );

      expect(js).toContain('relative-helper');
      expect(js).toContain('tiny-package');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('支持成员表达式入口', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/ui.tsx',
        [
          'const Badge = () => <span>badge</span>;',
          'export default { Badge };',
        ].join('\n'),
      );

      const refs = references(
        root,
        [
          "import UI from '../../components/ui';",
          '',
          '<UI.Badge />',
        ].join('\n'),
      );
      const result = await build(root, refs);

      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0]?.exportName).toBe(
        'default.Badge',
      );
      const js = readFileSync(
        result.bundles[0]!.jsPath,
        'utf8',
      );
      expect(js).toContain('Badge');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('拒绝 Node 内置模块（直接与间接）', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/bad.tsx',
        [
          "import { readFileSync } from 'node:fs';",
          'export default function Bad() { return <div>{String(readFileSync)}</div>; }',
        ].join('\n'),
      );
      const direct = references(
        root,
        [
          "import Bad from '../../components/bad';",
          '',
          '<Bad />',
        ].join('\n'),
      );

      const directError = await expectBuildIslandError(
        root,
        direct,
        'UNSAFE_IMPORT',
      );
      expect(directError.message).toContain('node:fs');

      writeFile(
        root,
        'components/helper.ts',
        "import { readFileSync } from 'node:fs';\nexport const value = readFileSync;\n",
      );
      writeFile(
        root,
        'components/indirect.tsx',
        [
          "import { value } from './helper';",
          'export default function Indirect() { return <div>{String(value)}</div>; }',
        ].join('\n'),
      );
      const indirect = references(
        root,
        [
          "import Indirect from '../../components/indirect';",
          '',
          '<Indirect />',
        ].join('\n'),
      );

      await expectBuildIslandError(
        root,
        indirect,
        'UNSAFE_IMPORT',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('产物包含 React 内部标记报 DUPLICATE_REACT', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/fake-react.tsx',
        [
          "export const marker = '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED';",
          'export default function FakeReact() { return <span>{marker}</span>; }',
        ].join('\n'),
      );
      const refs = references(
        root,
        [
          "import FakeReact from '../../components/fake-react';",
          '',
          '<FakeReact />',
        ].join('\n'),
      );

      await expectBuildIslandError(
        root,
        refs,
        'DUPLICATE_REACT',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('语法错误报 ISLAND_BUILD_FAILED', async () => {    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/broken.tsx',
        'export default function Broken() { return <div>; }\n',
      );
      const refs = references(
        root,
        [
          "import Broken from '../../components/broken';",
          '',
          '<Broken />',
        ].join('\n'),
      );

      try {
        await build(root, refs);
      } catch (error) {
        const islandError = expectIslandError(
          error,
          'ISLAND_BUILD_FAILED',
        );
        expect(islandError.file).toContain('broken.tsx');
        expect(islandError.message).toContain('Syntax Error');
        return;
      }

      throw new Error('预期 IslandError(ISLAND_BUILD_FAILED)');    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('产物文件名稳定并支持 basePath', async () => {
    const root = makeRoot();

    try {
      writeFile(
        root,
        'components/stable.tsx',
        'export default function Stable() { return <span>stable</span>; }\n',
      );
      const refs = references(
        root,
        [
          "import Stable from '../../components/stable';",
          '',
          '<Stable />',
        ].join('\n'),
      );
      const first = await build(root, refs, {
        cacheName: 'one',
        basePath: '/docs/',
      });
      const second = await build(root, refs, {
        cacheName: 'two',
        basePath: '/docs/',
      });

      expect(first.bundles[0]?.js).toBe(
        second.bundles[0]?.js,
      );
      expect(first.bundles[0]?.js).toStartWith(
        '/docs/assets/islands/island-',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('输出可选 CSS 并复制到 dist', async () => {
    const root = makeRoot();
    const outDir = path.join(root, 'dist');

    try {
      writeFile(
        root,
        'components/style.css',
        '.island { color: red; }\n',
      );
      writeFile(
        root,
        'components/styled.tsx',
        [
          "import './style.css';",
          'export default function Styled() { return <span className="island">s</span>; }',
        ].join('\n'),
      );
      const refs = references(
        root,
        [
          "import Styled from '../../components/styled';",
          '',
          '<Styled />',
        ].join('\n'),
      );
      const result = await build(root, refs);

      expect(result.bundles[0]?.css).toStartWith(
        '/assets/islands/island-',
      );
      expect(result.bundles[0]?.cssPath).toBeDefined();

      mkdirSync(outDir, { recursive: true });
      copyIslandAssets(outDir, result);

      for (const bundle of result.bundles) {
        expect(
          existsSync(
            path.join(
              outDir,
              'assets',
              'islands',
              path.basename(bundle.jsPath),
            ),
          ),
        ).toBe(true);
        if (bundle.cssPath) {
          expect(
            existsSync(
              path.join(
                outDir,
                'assets',
                'islands',
                path.basename(bundle.cssPath),
              ),
            ),
          ).toBe(true);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('无岛屿时不创建缓存目录', async () => {
    const root = makeRoot();

    try {
      const result = await buildIslandBundles([], {
        workspaceRoot: root,
        cacheDir: path.join(root, '.cache/empty'),
      });

      expect(result.bundles).toEqual([]);
      expect(existsSync(path.join(root, '.cache'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('containsBundledReact', () => {
  it('识别 React 内部标记', () => {
    expect(
      containsBundledReact(
        '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
      ),
    ).toBe(true);
    expect(
      containsBundledReact(
        'ReactCurrentDispatcher',
      ),
    ).toBe(true);
    expect(
      containsBundledReact('import{useState}from"react";'),
    ).toBe(false);
  });
});
