import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const cliPath = path.resolve(import.meta.dirname, 'cli.ts');

type CliResult = {
  status: number;
  stdout: string;
  stderr: string;
};

function runCli(
  args: string[],
  cwd = repoRoot,
): CliResult {
  const result = spawnSync(
    process.execPath,
    [cliPath, ...args],
    {
      cwd,
      encoding: 'utf8',
    },
  );

  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function makeOutDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'wordma-cli-'));
}

function expectBrokenFixture(
  fixture: string,
  code: string,
): string {
  const outDir = makeOutDir();

  try {
    const result = runCli([
      'build',
      '--root',
      `fixtures/broken/${fixture}`,
      `--out=${outDir}`,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`[${code}]`);
    return result.stderr;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(
      path.join(
        repoRoot,
        'fixtures/broken',
        fixture,
        '.wordma',
      ),
      { recursive: true, force: true },
    );
  }
}

describe('wordma-engine CLI', () => {
  it('--help 输出命令说明', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('inspect');
    expect(result.stdout).toContain('build');
    expect(result.stdout).toContain('--include-drafts');
  });

  it('--version 输出版本', () => {
    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wordma-engine 0.0.0');
  });

  it('inspect --json 输出合法 JSON', () => {
    const result = runCli([
      'inspect',
      '--root=fixtures/minimal',
      '--json',
    ]);

    expect(result.status).toBe(0);

    const data = JSON.parse(result.stdout) as {
      site: { title: string };
      collections: Array<{ name: string; count: number }>;
    };

    expect(data.site.title).toBe('Minimal Wordma Site');
    expect(data.collections.map((item) => item.name)).toEqual([
      'pages',
      'posts',
    ]);
  });

  it('build 成功并输出页面', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/content-layer',
        `--out=${outDir}`,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Built 17 routes');
      expect(existsSync(path.join(outDir, 'index.html'))).toBe(true);
      expect(existsSync(path.join(outDir, '404.html'))).toBe(true);

      const manifest = JSON.parse(
        readFileSync(
          path.join(outDir, '.wordma-manifest.json'),
          'utf8',
        ),
      ) as { routes: unknown[] };

      expect(manifest.routes).toHaveLength(17);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('build --include-drafts 输出草稿', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/content-layer',
        '--out',
        outDir,
        '--include-drafts',
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Built 20 routes');
      expect(
        existsSync(path.join(outDir, 'posts/draft/index.html')),
      ).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('内容错误输出 INVALID_FRONTMATTER 并退出 1', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/broken/invalid-frontmatter',
        '--out',
        outDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[INVALID_FRONTMATTER]');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('路由冲突输出 ROUTE_CONFLICT 并退出 1', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/broken/route-conflict',
        '--out',
        outDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[ROUTE_CONFLICT]');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('主题错误输出 INVALID_THEME_ENTRY 并退出 1', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/broken/bad-theme',
        '--out',
        outDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[INVALID_THEME_ENTRY]');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('不安全输出目录输出 UNSAFE_OUT_DIR 并退出 1', () => {
    const result = runCli([
      'build',
      '--root',
      'fixtures/content-layer',
      '--out',
      'fixtures/content-layer',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[UNSAFE_OUT_DIR]');
    expect(
      existsSync(
        path.join(
          repoRoot,
          'fixtures/content-layer/index.html',
        ),
      ),
    ).toBe(false);
  });

  it('拒绝未知参数', () => {
    const result = runCli(['build', '--unknown']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('未知参数');
  });

  it('拒绝缺少路径的参数', () => {
    const result = runCli(['build', '--root']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('需要一个路径');
  });

  it('MDX 未知组件输出文件与行号', () => {
    const stderr = expectBrokenFixture(
      'missing-component',
      'MISSING_COMPONENT_IMPORT',
    );

    expect(stderr).toContain('missing.mdx:8:1');
    expect(stderr).toContain('<Missing>');
  });

  it('MDX 表达式输出 UNSUPPORTED_EXPRESSION 与行号', () => {
    const stderr = expectBrokenFixture(
      'mdx-expression',
      'UNSUPPORTED_EXPRESSION',
    );

    expect(stderr).toContain('expression.mdx:8:1');
  });

  it('非法岛屿 props 输出 INVALID_ISLAND_PROPS 与行号', () => {
    const stderr = expectBrokenFixture(
      'mdx-invalid-props',
      'INVALID_ISLAND_PROPS',
    );

    expect(stderr).toContain('props.mdx:10:10');
  });

  it('岛屿嵌套输出 NESTED_ISLAND 与行号', () => {
    const stderr = expectBrokenFixture(
      'mdx-nested-island',
      'NESTED_ISLAND',
    );

    expect(stderr).toContain('nested.mdx:12:3');
    expect(stderr).toContain('<Note>');
  });

  it('逃逸 import 输出 UNSAFE_IMPORT 与行号', () => {
    const stderr = expectBrokenFixture(
      'mdx-unsafe-import',
      'UNSAFE_IMPORT',
    );

    expect(stderr).toContain('unsafe.mdx:6:1');
  });

  it('岛屿 Node 内置模块输出 UNSAFE_IMPORT', () => {
    const stderr = expectBrokenFixture(
      'island-node-builtin',
      'UNSAFE_IMPORT',
    );

    expect(stderr).toContain('bad.tsx');
    expect(stderr).toContain('node:fs');
    expect(stderr).toContain('export: default');
  });

  it('岛屿构建失败输出 ISLAND_BUILD_FAILED', () => {
    const stderr = expectBrokenFixture(
      'island-build-failure',
      'ISLAND_BUILD_FAILED',
    );

    expect(stderr).toContain('broken.tsx');
    expect(stderr).toContain('Syntax Error');
    expect(stderr).toContain('export: default');
  });

  it('dev 仍提示尚未实现', () => {
    const result = runCli(['dev']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('尚未实现');
  });
});
