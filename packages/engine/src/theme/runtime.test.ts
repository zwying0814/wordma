import { describe, expect, it } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ThemeError,
  buildSite,
  loadThemeRuntime,
} from '../index';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

function makeThemeRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'wordma-theme-'));
}

function writeTheme(
  root: string,
  id: string,
  source: string,
  engines = '>=0.0.0',
): void {
  const directory = path.join(root, 'themes', id);
  mkdirSync(path.join(directory, 'src'), { recursive: true });

  writeFileSync(
    path.join(directory, 'theme.yaml'),
    [
      `id: ${id}`,
      'displayName: Test Theme',
      'version: 0.0.0',
      'engines:',
      `  wordma: "${engines}"`,
      'settings: []',
      'pages: []',
    ].join('\n'),
  );

  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify(
      {
        name: id,
        version: '0.0.0',
        type: 'module',
        exports: {
          '.': './src/index.tsx',
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(path.join(directory, 'src/index.tsx'), source);
}

async function expectThemeError(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ThemeError);
    expect((error as ThemeError).code).toBe(code);
    return;
  }

  throw new Error(`预期抛出 ThemeError(${code})`);
}

describe('loadThemeRuntime', () => {
  it('加载默认主题与必需布局', async () => {
    const runtime = await loadThemeRuntime(
      path.join(repoRoot, 'fixtures/content-layer'),
      'wordma-theme-default',
    );

    expect(runtime.manifest.id).toBe('wordma-theme-default');
    expect(runtime.entryPath.endsWith('themes/default/src/index.tsx')).toBe(
      true,
    );

    for (const key of ['root', 'index', 'post', 'page', 'notFound']) {
      expect(typeof runtime.definition.layouts[key]).toBe('function');
    }

    expect(typeof runtime.definition.layouts.archive).toBe('function');
    expect(typeof runtime.definition.layouts.taxonomy).toBe('function');
  });

  it('workspace 外部主题共享 engine 运行时并支持本地依赖', async () => {
    const root = makeThemeRoot();
    const themeId = 'wordma-theme-external';
    const themeDir = path.join(root, 'themes', themeId);

    cpSync(
      path.join(repoRoot, 'themes/default'),
      themeDir,
      { recursive: true },
    );

    const themeYamlPath = path.join(themeDir, 'theme.yaml');
    writeFileSync(
      themeYamlPath,
      readFileSync(themeYamlPath, 'utf8')
        .replace(
          'id: wordma-theme-default',
          `id: ${themeId}`,
        )
        .replace(
          'displayName: Default',
          'displayName: External Theme',
        ),
    );

    const packagePath = path.join(
      themeDir,
      'package.json',
    );
    const packageJson = JSON.parse(
      readFileSync(packagePath, 'utf8'),
    );
    packageJson.name = themeId;
    writeFileSync(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );

    mkdirSync(
      path.join(themeDir, 'node_modules/theme-helper'),
      { recursive: true },
    );
    writeFileSync(
      path.join(
        themeDir,
        'node_modules/theme-helper/package.json',
      ),
      JSON.stringify({
        name: 'theme-helper',
        version: '1.0.0',
        type: 'module',
        exports: './index.js',
      }),
    );
    writeFileSync(
      path.join(
        themeDir,
        'node_modules/theme-helper/index.js',
      ),
      'export const helper = "ok";\n',
    );
    writeFileSync(
      path.join(themeDir, 'src/index.tsx'),
      `${readFileSync(
        path.join(themeDir, 'src/index.tsx'),
        'utf8',
      )}\nimport "theme-helper";\n`,
    );

    mkdirSync(
      path.join(root, 'content/posts'),
      { recursive: true },
    );
    writeFileSync(
      path.join(root, 'wordma.site.yaml'),
      [
        'site:',
        '  title: External Theme Site',
        '  language: zh-CN',
        'theme:',
        `  id: ${themeId}`,
        '',
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, 'content/posts/hello.mdx'),
      [
        '---',
        'title: External Hello',
        '---',
        '',
        '# External Hello',
        '',
      ].join('\n'),
    );

    try {
      const outDir = path.join(root, 'dist');
      const result = await buildSite({
        root,
        outDir,
        cache: false,
      });
      const html = readFileSync(
        path.join(outDir, 'index.html'),
        'utf8',
      );

      expect(result.theme.id).toBe(themeId);
      expect(html).toContain('External Theme Site');
      expect(html).toMatch(
        /assets\/css\/theme-[a-f0-9]+\.css/,
      );
      expect(
        existsSync(
          path.join(
            root,
            '.wordma/cache/v1/theme-runtime',
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('主题不存在时报 THEME_NOT_FOUND', async () => {
    await expectThemeError(
      () =>
        loadThemeRuntime(
          path.join(repoRoot, 'fixtures/content-layer'),
          'wordma-theme-missing',
        ),
      'THEME_NOT_FOUND',
    );
  });

  it('主题包缺少入口时报 INVALID_THEME_ENTRY', async () => {
    const root = makeThemeRoot();
    const id = 'wordma-theme-no-package';

    writeTheme(root, id, 'export default { layouts: {} };\n');
    rmSync(path.join(root, 'themes', id, 'package.json'));

    try {
      await expectThemeError(
        () => loadThemeRuntime(root, id),
        'INVALID_THEME_ENTRY',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('缺少必需布局时报 MISSING_LAYOUT', async () => {
    const root = makeThemeRoot();
    const id = 'wordma-theme-missing-layout';

    writeTheme(
      root,
      id,
      'export default { layouts: { root: () => null } };\n',
    );

    try {
      await expectThemeError(
        () => loadThemeRuntime(root, id),
        'MISSING_LAYOUT',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('缺少 archive/taxonomy 时回退到 index 并给出警告', async () => {
    const root = makeThemeRoot();
    const id = 'wordma-theme-fallback';

    writeTheme(
      root,
      id,
      [
        'const Layout = () => null;',
        'export default {',
        '  layouts: {',
        '    root: Layout,',
        '    index: Layout,',
        '    post: Layout,',
        '    page: Layout,',
        '    notFound: Layout,',
        '  },',
        '};',
      ].join('\n'),
    );

    try {
      const runtime = await loadThemeRuntime(root, id);

      expect(runtime.definition.layouts.archive).toBe(
        runtime.definition.layouts.index,
      );
      expect(runtime.definition.layouts.taxonomy).toBe(
        runtime.definition.layouts.index,
      );
      const warnings = runtime.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'MISSING_LAYOUT',
      );
      expect(warnings).toHaveLength(2);
      expect(
        warnings.every(
          (warning) => warning.severity === 'warning',
        ),
      ).toBe(true);
      expect(
        warnings.every((warning) =>
          warning.file?.endsWith('theme.yaml'),
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('版本不满足时在导入主题入口前报错', async () => {
    const root = makeThemeRoot();
    const id = 'wordma-theme-version-mismatch';

    writeTheme(
      root,
      id,
      'throw new Error("theme entry should not load");\n',
      '>=99.0.0',
    );

    try {
      await expectThemeError(
        () => loadThemeRuntime(root, id),
        'ENGINE_VERSION_MISMATCH',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('非法引擎范围报 INVALID_ENGINE_RANGE', async () => {
    const root = makeThemeRoot();
    const id = 'wordma-theme-invalid-range';

    writeTheme(
      root,
      id,
      'export default { layouts: {} };\n',
      'not-a-range',
    );

    try {
      await expectThemeError(
        () => loadThemeRuntime(root, id),
        'INVALID_ENGINE_RANGE',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
