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
  loadWorkspace,
  type ThemeManifest,
} from '@wordma/content';

import { ThemeError } from '../errors';
import type { RouteManifest } from '../routing/manifest';
import type { ThemeRuntime } from './runtime';
import {
  assertRouteLayouts,
  assertValidThemeContent,
  validateThemeContent,
} from './validate';

function makeWorkspace(): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-page-types-'),
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
      '  title: Page Types',
      'theme:',
      '  id: wordma-theme-pages',
    ].join('\n'),
  );
  write(
    'content/pages/about.mdx',
    '---\ntitle: About\ntype: unknown-type\n---\n\n# About',
  );
  write(
    'content/projects/demo.mdx',
    '---\ntitle: Demo\ntype: project\n---\n\n# Demo',
  );

  return root;
}

function manifest(): ThemeManifest {
  return {
    id: 'wordma-theme-pages',
    displayName: 'Pages',
    version: '1.0.0',
    engines: { wordma: '>=0.0.0' },
    settings: [],
    pages: [],
    content: {
      version: 1,
      post: { fields: [] },
      page: { fields: [] },
      pageTypes: {
        project: {
          label: 'Project',
          route: '/projects/[slug]',
          layout: 'project',
          collection: 'projects',
          fields: [],
        },
        missing: {
          label: 'Missing',
          route: '/missing/[slug]',
          layout: 'page',
          collection: 'missing-collection',
          fields: [],
        },
        invalid: {
          label: 'Invalid',
          route: '/invalid/[collection]',
          layout: 'page',
          fields: [],
        },
      },
    },
  };
}

function fakeRuntime(
  layouts: Record<string, () => null>,
): ThemeRuntime {
  return {
    directory: '/theme',
    manifest: manifest(),
    definition: { layouts },
    entryPath: '/theme/src/index.tsx',
    diagnostics: [],
  };
}

function routeManifest(layout: string): RouteManifest {
  return {
    routes: [
      {
        path: '/about/',
        output: 'about/index.html',
        kind: 'page',
        layout,
      },
    ],
    diagnostics: [],
  };
}

describe('validateThemeContent', () => {
  it('报告未知 pageType、缺失 collection 与非法占位符', () => {
    const root = makeWorkspace();

    try {
      const workspace = loadWorkspace(root);
      const result = validateThemeContent(
        workspace,
        manifest(),
      );

      expect(
        result.diagnostics.find(
          (item) => item.code === 'UNKNOWN_PAGE_TYPE',
        ),
      ).toMatchObject({
        severity: 'warning',
        field: 'type',
      });
      expect(
        result.diagnostics.find(
          (item) =>
            item.code === 'MISSING_COLLECTION',
        ),
      ).toMatchObject({
        severity: 'warning',
        field: 'missing',
      });
      expect(
        result.diagnostics.find(
          (item) =>
            item.code === 'INVALID_PAGE_TYPE_ROUTE',
        ),
      ).toMatchObject({
        severity: 'error',
        field: 'invalid',
      });

      expect(() =>
        assertValidThemeContent(result, {
          themeId: 'wordma-theme-pages',
          path: '/theme',
        }),
      ).toThrow(ThemeError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('assertRouteLayouts', () => {
  it('缺失布局时抛 MISSING_LAYOUT', () => {
    const runtime = fakeRuntime({
      index: () => null,
    });

    try {
      assertRouteLayouts(routeManifest('about'), runtime);
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeError);
      expect((error as ThemeError).code).toBe(
        'MISSING_LAYOUT',
      );
      return;
    }

    throw new Error('预期抛出 ThemeError(MISSING_LAYOUT)');
  });

  it('布局存在时通过', () => {
    const runtime = fakeRuntime({
      about: () => null,
    });

    expect(() =>
      assertRouteLayouts(routeManifest('about'), runtime),
    ).not.toThrow();
  });
});
