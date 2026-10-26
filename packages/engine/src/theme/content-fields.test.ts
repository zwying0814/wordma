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
import {
  applyThemeContentSchema,
  assertValidThemeFields,
  resolveEntryThemeFields,
} from './content-fields';

const themeId = 'wordma-theme-fields';

function manifest(): ThemeManifest {
  return {
    id: themeId,
    displayName: 'Fields',
    version: '1.0.0',
    engines: { wordma: '>=0.0.0' },
    settings: [],
    pages: [],
    content: {
      version: 1,
      post: {
        fields: [
          {
            key: 'heroStyle',
            type: 'select',
            label: 'Hero',
            default: 'wide',
            options: [
              { label: 'Wide', value: 'wide' },
              { label: 'Card', value: 'card' },
            ],
          },
          {
            key: 'featured',
            type: 'switch',
            label: 'Featured',
            default: true,
          },
        ],
      },
      page: {
        fields: [
          {
            key: 'pageOnly',
            type: 'text',
            label: 'Page only',
            default: 'yes',
          },
        ],
      },
      pageTypes: {
        about: {
          label: 'About',
          route: '/about',
          layout: 'about',
          fields: [
            {
              key: 'subtitle',
              type: 'text',
              label: 'Subtitle',
              default: 'About subtitle',
            },
          ],
        },
        project: {
          label: 'Project',
          route: '/projects/[slug]',
          layout: 'project',
          collection: 'projects',
          fields: [
            {
              key: 'repo',
              type: 'text',
              label: 'Repo',
              required: true,
            },
          ],
        },
      },
    },
  };
}

function makeWorkspace(): string {
  const root = mkdtempSync(
    path.join(tmpdir(), 'wordma-theme-fields-'),
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
      '  title: Fields Workspace',
      'theme:',
      `  id: ${themeId}`,
    ].join('\n'),
  );
  write(
    'content/posts/a.mdx',
    [
      '---',
      'title: A',
      'theme:',
      `  ${themeId}:`,
      '    heroStyle: card',
      '    extra: kept',
      '  other-theme:',
      '    keep: yes',
      '---',
      '',
      '# A',
    ].join('\n'),
  );
  write(
    'content/pages/about.mdx',
    [
      '---',
      'title: About',
      'type: about',
      '---',
      '',
      '# About',
    ].join('\n'),
  );
  write(
    'content/projects/demo.mdx',
    [
      '---',
      'title: Demo',
      'type: project',
      '---',
      '',
      '# Demo',
    ].join('\n'),
  );
  write(
    'content/projects/plain.mdx',
    '---\ntitle: Plain\n---\n\n# Plain',
  );

  return root;
}

function entry(root: string, id: string) {
  const workspace = loadWorkspace(root);
  const item = workspace.index.entries.find(
    (candidate) => candidate.id === id,
  );
  if (!item) throw new Error(`缺少 entry：${id}`);

  return { workspace, item };
}

describe('theme content fields', () => {
  it('应用默认值、保留未知字段并只归一化当前 namespace', () => {
    const root = makeWorkspace();

    try {
      const { item } = entry(root, 'posts/a');
      const resolved = resolveEntryThemeFields(
        manifest(),
        item,
        themeId,
      );

      expect(resolved.values).toEqual({
        heroStyle: 'card',
        featured: true,
        extra: 'kept',
      });
      expect(resolved.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'UNKNOWN_THEME_FIELD',
          severity: 'warning',
          field: 'extra',
        }),
      );

      const workspace = loadWorkspace(root);
      const result = applyThemeContentSchema(
        workspace,
        manifest(),
        themeId,
      );
      const applied = workspace.index.entries.find(
        (candidate) => candidate.id === 'posts/a',
      );

      expect(applied?.meta.data.theme).toMatchObject({
        [themeId]: {
          heroStyle: 'card',
          featured: true,
          extra: 'kept',
        },
        'other-theme': { keep: 'yes' },
      });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'UNKNOWN_THEME_FIELD',
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('校验类型、选项、长度、日期与 required', () => {
    const root = makeWorkspace();

    try {
      const { item } = entry(root, 'posts/a');
      const custom: ThemeManifest = {
        ...manifest(),
        content: {
          ...manifest().content!,
          post: {
            fields: [
              {
                key: 'heroStyle',
                type: 'select',
                label: 'Hero',
                default: 'wide',
                options: [
                  { label: 'Wide', value: 'wide' },
                ],
              },
              {
                key: 'subtitle',
                type: 'text',
                label: 'Subtitle',
                required: true,
                minLength: 3,
              },
              {
                key: 'day',
                type: 'date',
                label: 'Day',
                default: '2026-02-30',
              },
              {
                key: 'items',
                type: 'list',
                label: 'Items',
                item: 'number',
                default: ['x' as unknown as number],
              },
            ],
          },
        },
      };
      const resolved = resolveEntryThemeFields(
        custom,
        item,
        themeId,
      );
      const errors = resolved.diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error',
      );

      expect(
        errors.map((diagnostic) => diagnostic.field),
      ).toEqual(
        expect.arrayContaining([
          'heroStyle',
          'subtitle',
          'day',
          'items',
        ]),
      );
      expect(
        errors.every(
          (diagnostic) =>
            diagnostic.code === 'INVALID_THEME_FIELD' ||
            diagnostic.code === 'MISSING_THEME_FIELD',
        ),
      ).toBe(true);

      expect(() =>
        assertValidThemeFields(
          {
            entries: 1,
            diagnostics: errors,
          },
          {
            themeId,
            path: '/theme',
          },
        ),
      ).toThrow(ThemeError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('按 pageType 与页面/集合回退选择字段声明', () => {
    const root = makeWorkspace();

    try {
      const about = entry(root, 'pages/about').item;
      const project = entry(root, 'projects/demo').item;
      const plain = entry(root, 'projects/plain').item;
      const theme = manifest();

      expect(
        resolveEntryThemeFields(theme, about, themeId).values,
      ).toEqual({ subtitle: 'About subtitle' });
      expect(
        resolveEntryThemeFields(theme, about, themeId).values,
      ).not.toHaveProperty('pageOnly');

      const projectFields = resolveEntryThemeFields(
        theme,
        project,
        themeId,
      );
      expect(projectFields.diagnostics[0]).toMatchObject({
        code: 'MISSING_THEME_FIELD',
        field: 'repo',
      });

      expect(
        resolveEntryThemeFields(theme, plain, themeId).values,
      ).toEqual({ pageOnly: 'yes' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
