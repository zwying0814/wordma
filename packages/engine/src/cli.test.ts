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

async function readUntil(
  stream: ReadableStream<Uint8Array>,
  marker: string,
  timeoutMs = 8000,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  return await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `等待 "${marker}" 超时\n--- output ---\n${output}`,
        ),
      );
    }, timeoutMs);

    const pump = async (): Promise<void> => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timer);
            reject(
              new Error(
                `进程在 "${marker}" 前退出\n--- output ---\n${output}`,
              ),
            );
            return;
          }

          output += decoder.decode(value, {
            stream: true,
          });

          if (output.includes(marker)) {
            clearTimeout(timer);
            resolve(output);
            void (async () => {
              try {
                while (!(await reader.read()).done) {
                  // drain
                }
              } catch {
                // ignore
              }
            })();
            return;
          }
        }
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    };

    void pump();
  });
}

function freePort(): number {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response(''),
  });
  const port = server.port;
  server.stop(true);

  if (typeof port !== 'number') {
    throw new Error('无法分配测试端口');
  }

  return port;
}

async function waitForHttp(
  url: string,
  timeoutMs = 8000,
): Promise<Response> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < timeoutMs) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) =>
        setTimeout(resolve, 25),
      );
    }
  }

  throw new Error(`等待 HTTP 服务超时：${url}\n${String(lastError)}`);
}

function parseEvents(output: string): Array<
  Record<string, unknown> & {
    v: number;
    seq: number;
    time: string;
    type: string;
  }
> {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
    expect(result.stdout).toContain('dev');
    expect(result.stdout).toContain('--include-drafts');
    expect(result.stdout).toContain('--port');
    expect(result.stdout).toContain('--no-watch');
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

  it('build --json 输出单条 NDJSON', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/content-layer',
        `--out=${outDir}`,
        '--json',
        '--no-cache',
      ]);
      const lines = result.stdout
        .trim()
        .split('\n')
        .filter(Boolean);

      expect(result.status).toBe(0);
      expect(lines).toHaveLength(1);

      const event = JSON.parse(lines[0] ?? '') as {
        v: number;
        seq: number;
        type: string;
        routes: number;
      };

      expect(event.v).toBe(1);
      expect(event.seq).toBe(1);
      expect(event.type).toBe('build-success');
      expect(event.routes).toBe(17);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(
        path.join(
          repoRoot,
          'fixtures/content-layer/.wordma',
        ),
        { recursive: true, force: true },
      );
    }
  });

  it('build --json 失败输出 build-error', () => {
    const outDir = makeOutDir();

    try {
      const result = runCli([
        'build',
        '--root',
        'fixtures/broken/missing-component',
        `--out=${outDir}`,
        '--json',
      ]);
      const event = JSON.parse(
        result.stdout.trim(),
      ) as {
        type: string;
        diagnostics: Array<{ code: string }>;
      };

      expect(result.status).toBe(1);
      expect(event.type).toBe('build-error');
      expect(event.diagnostics[0]?.code).toBe(
        'MISSING_COMPONENT_IMPORT',
      );
    } finally {
      rmSync(outDir, { recursive: true, force: true });
      rmSync(
        path.join(
          repoRoot,
          'fixtures/broken/missing-component/.wordma',
        ),
        { recursive: true, force: true },
      );
    }
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
      rmSync(
        path.join(
          repoRoot,
          'fixtures/content-layer/.wordma',
        ),
        { recursive: true, force: true },
      );
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
      rmSync(
        path.join(
          repoRoot,
          'fixtures/content-layer/.wordma',
        ),
        { recursive: true, force: true },
      );
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

  it('dev 拒绝无效端口', () => {
    const result = runCli(['dev', '--port', 'abc']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('无效端口');
  });

  it(
    'dev 启动、响应请求并优雅退出',
    async () => {
      const outDir = makeOutDir();
      const port = freePort();
      const proc = Bun.spawn(
        [
          process.execPath,
          cliPath,
          'dev',
          '--root',
          'fixtures/minimal',
          `--out=${outDir}`,
          `--port=${port}`,
          '--no-watch',
        ],
        {
          cwd: repoRoot,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const stdout = proc.stdout as ReadableStream<Uint8Array>;
      const stderr = proc.stderr as ReadableStream<Uint8Array>;
      const stderrText = new Response(stderr).text();
      let exited = false;

      try {
        const output = await readUntil(stdout, 'Dev server:');
        expect(output).toContain(
          'Dev server: http://127.0.0.1:',
        );

        const response = await fetch(
          `http://127.0.0.1:${port}/`,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain('Minimal Wordma Site');

        proc.kill('SIGINT');
        const code = await proc.exited;
        exited = true;
        const errors = await stderrText;

        expect(code).toBe(0);
        expect(errors).not.toContain('Error');
      } finally {
        if (!exited && proc.exitCode === null) {
          proc.kill('SIGKILL');
          await proc.exited;
        }
        rmSync(outDir, { recursive: true, force: true });
        rmSync(
          path.join(
            repoRoot,
            'fixtures/minimal/.wordma',
          ),
          { recursive: true, force: true },
        );
      }
    },
    15000,
  );

  it(
    'dev --json 输出合法 NDJSON 且 exit 最后',
    async () => {
      const outDir = makeOutDir();
      const port = freePort();
      const proc = Bun.spawn(
        [
          process.execPath,
          cliPath,
          'dev',
          '--root',
          'fixtures/minimal',
          `--out=${outDir}`,
          `--port=${port}`,
          '--no-watch',
          '--json',
        ],
        {
          cwd: repoRoot,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const stdout = proc.stdout as ReadableStream<Uint8Array>;
      const stderr = proc.stderr as ReadableStream<Uint8Array>;
      const stderrText = new Response(stderr).text();
      let exited = false;

      try {
        await waitForHttp(`http://127.0.0.1:${port}/`);
        proc.kill('SIGINT');
        const code = await proc.exited;
        exited = true;

        const output = await new Response(stdout).text();
        const events = parseEvents(output);
        await stderrText;

        expect(code).toBe(0);
        expect(events.length).toBeGreaterThanOrEqual(3);
        expect(events.map((event) => event.type)).toEqual([
          'build-success',
          'ready',
          'exit',
        ]);
        expect(
          events.every(
            (event, index) =>
              event.v === 1 &&
              event.seq === index + 1 &&
              !Number.isNaN(Date.parse(event.time)),
          ),
        ).toBe(true);
        expect(events[events.length - 1]?.code).toBe(0);
      } finally {
        if (!exited && proc.exitCode === null) {
          proc.kill('SIGKILL');
          await proc.exited;
        }
        rmSync(outDir, { recursive: true, force: true });
        rmSync(
          path.join(
            repoRoot,
            'fixtures/minimal/.wordma',
          ),
          { recursive: true, force: true },
        );
      }
    },
    15000,
  );

  it(
    'dev --json 启动失败时 build-error 后输出 exit',
    async () => {
      const outDir = makeOutDir();
      const port = freePort();
      const proc = Bun.spawn(
        [
          process.execPath,
          cliPath,
          'dev',
          '--root',
          'fixtures/broken/missing-component',
          `--out=${outDir}`,
          `--port=${port}`,
          '--no-watch',
          '--json',
        ],
        {
          cwd: repoRoot,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );

      try {
        const code = await proc.exited;
        const output = await new Response(
          proc.stdout as ReadableStream<Uint8Array>,
        ).text();
        const events = parseEvents(output);

        expect(code).toBe(1);
        expect(events.map((event) => event.type)).toEqual([
          'build-error',
          'exit',
        ]);
        expect(
          (
            events[0]?.diagnostics as Array<{
              code: string;
            }>
          )[0]?.code,
        ).toBe('MISSING_COMPONENT_IMPORT');
        expect(events[1]?.code).toBe(1);
      } finally {
        if (proc.exitCode === null) {
          proc.kill('SIGKILL');
          await proc.exited;
        }
        rmSync(outDir, { recursive: true, force: true });
        rmSync(
          path.join(
            repoRoot,
            'fixtures/broken/missing-component/.wordma',
          ),
          { recursive: true, force: true },
        );
      }
    },
    15000,
  );
});
