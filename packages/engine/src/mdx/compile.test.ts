import { describe, expect, it } from 'bun:test';
import path from 'node:path';

import {
  loadWorkspace,
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';

import { MdxError } from '../errors';
import { compileMdx } from './compile';
import { createPageContext } from '../render/page-context';
import { buildRouteManifest } from '../routing/manifest';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const islandsRoot = path.join(repoRoot, 'fixtures/islands');
const contentLayerRoot = path.join(
  repoRoot,
  'fixtures/content-layer',
);

function entry(root: string, id: string) {
  const item = loadWorkspace(root).index.entries.find(
    (candidate) => candidate.id === id,
  );
  if (!item) throw new Error(`缺少 entry：${id}`);

  return item;
}

describe('compileMdx', () => {
  it('渲染正文、标题与岛屿占位符', async () => {
    const source = entry(islandsRoot, 'posts/islands');
    const result = await compileMdx(source.body, {
      filePath: source.filePath,
      workspaceRoot: islandsRoot,
    });

    expect(result.headings).toEqual([
      { id: 'islands', text: 'Islands', depth: 1 },
    ]);
    expect(result.html).toContain('<h1 id="islands">');
    expect(result.islands).toHaveLength(2);
    expect(result.islands.map((item) => item.name)).toEqual([
      'Counter',
      'Note',
    ]);
    expect(result.islands[0]?.relativeSource).toBe(
      'components/counter.tsx',
    );
    expect(result.islands[1]?.slotHtml).toContain(
      'This content is rendered inside a Note island.',
    );
    expect(result.html).toContain('data-wordma-island="Counter"');
    expect(result.html).toContain('data-wordma-island="Note"');
  });

  it('渲染普通 Markdown 正文与 excerpt', async () => {
    const result = await compileMdx(
      [
        '# Standalone Post',
        '',
        'Content layer fixture.',
        '',
        '## Details',
      ].join('\n'),
      {
        filePath: path.join(
          contentLayerRoot,
          'content/posts/standalone.mdx',
        ),
        workspaceRoot: contentLayerRoot,
      },
    );

    expect(result.html).toContain(
      '<h1 id="standalone-post">',
    );
    expect(result.html).toContain('Content layer fixture.');
    expect(result.headings.map((item) => item.id)).toEqual([
      'standalone-post',
      'details',
    ]);
    expect(result.excerpt).toBe('Content layer fixture.');
    expect(result.islands).toEqual([]);
  });

  it('编译错误带文件信息', async () => {
    const filePath = path.join(
      islandsRoot,
      'content/posts/islands.mdx',
    );

    try {
      await compileMdx('\n<Missing />', {
        filePath,
        workspaceRoot: islandsRoot,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MdxError);
      expect((error as MdxError).code).toBe(
        'MISSING_COMPONENT_IMPORT',
      );
      expect((error as MdxError).file).toBe(filePath);
      expect((error as MdxError).line).toBe(2);
      return;
    }

    throw new Error('预期抛出 MdxError');
  });

  it('createPageContext 使用编译结果', async () => {
    const workspace = loadWorkspace(islandsRoot);
    const themeManifest = parseThemeManifest(
      parseYamlFile(path.join(repoRoot, 'themes/default/theme.yaml')),
    );
    const routeManifest = buildRouteManifest(
      workspace,
      themeManifest,
    );
    const route = routeManifest.routes.find(
      (item) => item.entryId === 'posts/islands',
    );
    if (!route) throw new Error('缺少岛屿文章路由');

    const source = entry(islandsRoot, 'posts/islands');
    const compiledContent = await compileMdx(source.body, {
      filePath: source.filePath,
      workspaceRoot: islandsRoot,
    });
    const context = createPageContext({
      route,
      workspace,
      routeManifest,
      themeManifest,
      compiledContent,
    });

    expect(context.content.html).toContain(
      'data-wordma-island="Counter"',
    );
    expect(context.content.headings).toEqual([
      { id: 'islands', text: 'Islands', depth: 1 },
    ]);
    expect(context.content.islands).toHaveLength(2);
    expect(context.content.islands[0]).toMatchObject({
      name: 'Counter',
      source: 'components/counter.tsx',
      exportName: 'default',
    });
  });
});
