import { describe, expect, it } from 'bun:test';

import {
  ContentError,
  YamlParseError,
  parseYaml,
} from '@wordma/content';
import { z } from 'zod';

import {
  BuildError,
  IslandError,
  MdxError,
  RouteError,
  ThemeError,
} from './errors';
import {
  diagnosticFromContent,
  diagnosticsFromError,
  formatDiagnostic,
} from './diagnostics';

describe('diagnosticsFromError', () => {
  it('映射 MDX / 岛屿 / 主题 / 路由 / 构建错误', () => {
    const mdx = diagnosticsFromError(
      new MdxError('MISSING_COMPONENT_IMPORT', 'missing', {
        file: '/site/a.mdx',
        line: 3,
        column: 2,
      }),
    )[0];

    expect(mdx).toMatchObject({
      code: 'MISSING_COMPONENT_IMPORT',
      severity: 'error',
      source: 'mdx',
      file: '/site/a.mdx',
      line: 3,
      column: 2,
    });

    expect(
      diagnosticsFromError(
        new MdxError('MISSING_COMPONENT_SOURCE', 'missing', {
          file: '/site/a.mdx',
          module: 'lucide-react',
        }),
      )[0],
    ).toMatchObject({
      module: 'lucide-react',
      source: 'mdx',
    });

    expect(
      diagnosticsFromError(
        new IslandError('DUPLICATE_REACT', 'duplicate', {
          file: '/site/c.tsx',
        }),
      )[0],
    ).toMatchObject({
      source: 'island',
      file: '/site/c.tsx',
    });

    expect(
      diagnosticsFromError(
        new ThemeError('MISSING_LAYOUT', 'layout', {
          themeId: 't',
          path: '/theme',
        }),
      )[0],
    ).toMatchObject({
      source: 'theme',
      file: '/theme',
    });

    expect(
      diagnosticsFromError(
        new ThemeError('CSS_BUILD_FAILED', 'css', {
          themeId: 't',
          path: '/theme/a.css',
        }),
      )[0]?.source,
    ).toBe('style');

    expect(
      diagnosticsFromError(
        new RouteError('ROUTE_CONFLICT', 'conflict', {
          path: '/about/',
        }),
      )[0],
    ).toMatchObject({
      source: 'route',
      path: '/about/',
    });

    expect(
      diagnosticsFromError(
        new BuildError('UNSAFE_OUT_DIR', 'out', {
          path: '/out',
        }),
      )[0],
    ).toMatchObject({
      source: 'build',
      path: '/out',
    });

    expect(
      diagnosticsFromError(
        new ContentError('INVALID_FRONTMATTER', 'bad', {
          file: '/site/a.mdx',
          path: 'title',
        }),
      )[0],
    ).toMatchObject({
      source: 'content',
      file: '/site/a.mdx',
      path: 'title',
    });
  });

  it('展开 YAML 与 Zod 诊断', () => {
    let yamlError: YamlParseError | undefined;
    try {
      parseYaml('a: 1\na: 2\n', {
        filePath: '/site/a.yaml',
      });
    } catch (error) {
      yamlError = error as YamlParseError;
    }

    const yaml = diagnosticsFromError(yamlError);
    expect(yaml.length).toBeGreaterThan(0);
    expect(yaml[0]).toMatchObject({
      source: 'content',
      severity: 'error',
      file: '/site/a.yaml',
    });
    expect(yaml[0]?.line).toBeGreaterThan(0);

    let zodError: unknown;
    try {
      z.object({
        title: z.string(),
      }).parse({});
    } catch (error) {
      zodError = error;
    }

    const zod = diagnosticsFromError(zodError);
    expect(zod[0]).toMatchObject({
      code: 'INVALID_SCHEMA',
      source: 'content',
      field: 'title',
    });
  });

  it('转换 content warning', () => {
    expect(
      diagnosticFromContent(
        {
          code: 'MISSING_ASSET',
          severity: 'warning',
          file: '/site/a.mdx',
          path: 'cover.png',
          message: 'missing',
        },
        'content',
      ),
    ).toEqual({
      code: 'MISSING_ASSET',
      severity: 'warning',
      source: 'content',
      message: 'missing',
      file: '/site/a.mdx',
      path: 'cover.png',
    });
  });
});

describe('formatDiagnostic', () => {
  it('输出 code、message、位置、path 与 field', () => {
    expect(
      formatDiagnostic({
        code: 'TEST',
        severity: 'error',
        source: 'mdx',
        message: 'boom',
        file: '/site/a.mdx',
        line: 4,
        column: 5,
        path: '/a/',
        field: 'title',
      }),
    ).toBe(
      [
        '[TEST] boom',
        '  at /site/a.mdx:4:5',
        '  path: /a/',
        '  field: title',
      ].join('\n'),
    );
  });
});
