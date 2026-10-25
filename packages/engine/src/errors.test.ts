import { describe, expect, it } from 'bun:test';

import {
  BuildError,
  IslandError,
  MdxError,
  RouteError,
  ThemeError,
} from './index';

describe('error contracts', () => {
  it('RouteError 保留 code / path / sources', () => {
    const error = new RouteError(
      'ROUTE_CONFLICT',
      '路由冲突',
      {
        path: '/about/',
        sources: ['page:about', 'theme-page:about'],
      },
    );

    expect(error.name).toBe('RouteError');
    expect(error.code).toBe('ROUTE_CONFLICT');
    expect(error.path).toBe('/about/');
    expect(error.sources).toEqual([
      'page:about',
      'theme-page:about',
    ]);
  });

  it('ThemeError 保留 code / themeId / path', () => {
    const error = new ThemeError(
      'MISSING_LAYOUT',
      '缺少布局',
      {
        themeId: 'wordma-theme-test',
        path: '/themes/wordma-theme-test',
      },
    );

    expect(error.name).toBe('ThemeError');
    expect(error.code).toBe('MISSING_LAYOUT');
    expect(error.themeId).toBe('wordma-theme-test');
    expect(error.path).toBe('/themes/wordma-theme-test');
  });

  it('MdxError 保留 code / file / line / column', () => {
    const error = new MdxError(
      'MISSING_COMPONENT_IMPORT',
      '缺少组件',
      {
        file: '/site/content/posts/a.mdx',
        line: 8,
        column: 1,
      },
    );

    expect(error.name).toBe('MdxError');
    expect(error.code).toBe('MISSING_COMPONENT_IMPORT');
    expect(error.file).toBe('/site/content/posts/a.mdx');
    expect(error.line).toBe(8);
    expect(error.column).toBe(1);
  });

  it('IslandError 保留 code / file / exportName', () => {
    const error = new IslandError(
      'ISLAND_BUILD_FAILED',
      '岛屿打包失败',
      {
        file: '/site/components/counter.tsx',
        exportName: 'default',
      },
    );

    expect(error.name).toBe('IslandError');
    expect(error.code).toBe('ISLAND_BUILD_FAILED');
    expect(error.file).toBe(
      '/site/components/counter.tsx',
    );
    expect(error.exportName).toBe('default');
  });

  it('BuildError 保留 code / path', () => {
    const error = new BuildError(
      'UNSAFE_OUT_DIR',
      '输出目录不安全',
      { path: '/workspace' },
    );

    expect(error.name).toBe('BuildError');
    expect(error.code).toBe('UNSAFE_OUT_DIR');
    expect(error.path).toBe('/workspace');
  });
});
