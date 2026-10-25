import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { startDevServer } from './server';
import type { DevServer } from './server';

function makeDist(): string {
  const dir = mkdtempSync(
    path.join(tmpdir(), 'wordma-dev-server-'),
  );

  const write = (relative: string, source: string): void => {
    const file = path.join(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  };

  write(
    'index.html',
    '<!DOCTYPE html><html><body><h1>Home</h1></body></html>',
  );
  write(
    'posts/hello/index.html',
    '<!DOCTYPE html><html><body><h1>Post</h1></body></html>',
  );
  write(
    '404.html',
    '<!DOCTYPE html><html><body><h1>Custom 404</h1></body></html>',
  );
  write('app.js', 'console.log("app")');
  write('style.css', 'body{color:red}');

  return dir;
}

async function readSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
  timeoutMs = 3000,
): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  const started = Date.now();

  while (!output.includes(marker)) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`等待 SSE 超时：${marker}\n${output}`);
    }

    const { done, value } = await reader.read();
    if (done) {
      throw new Error(`SSE 提前结束：${marker}\n${output}`);
    }
    output += decoder.decode(value, { stream: true });
  }

  return output;
}

function start(outDir: string, basePath?: string): DevServer {
  return startDevServer({
    outDir,
    host: '127.0.0.1',
    port: 0,
    basePath,
  });
}

describe('dev server', () => {
  it('服务 HTML、静态资源、HEAD 与自定义 404', async () => {
    const outDir = makeDist();
    const server = start(outDir);

    try {
      const home = await fetch(`${server.url}`);
      const homeHtml = await home.text();

      expect(home.status).toBe(200);
      expect(homeHtml).toContain('<h1>Home</h1>');
      expect(homeHtml).toContain(
        '<script type="module" src="/_wordma/client.js"></script>',
      );
      expect(homeHtml.indexOf('client.js')).toBeLessThan(
        homeHtml.indexOf('</body>'),
      );

      const post = await fetch(
        `${server.url}posts/hello/`,
      );
      expect(post.status).toBe(200);
      expect(await post.text()).toContain('<h1>Post</h1>');

      const missing = await fetch(
        `${server.url}missing/`,
      );
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain(
        '<h1>Custom 404</h1>',
      );

      const js = await fetch(`${server.url}app.js`);
      expect(js.status).toBe(200);
      expect(js.headers.get('content-type')).toContain(
        'text/javascript',
      );
      expect(await js.text()).toBe('console.log("app")');

      const css = await fetch(`${server.url}style.css`);
      expect(css.headers.get('content-type')).toContain(
        'text/css',
      );

      const head = await fetch(`${server.url}`, {
        method: 'HEAD',
      });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');

      const postMethod = await fetch(`${server.url}`, {
        method: 'POST',
      });
      expect(postMethod.status).toBe(405);
    } finally {
      server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('拒绝路径穿越', async () => {
    const outDir = makeDist();
    const server = start(outDir);

    try {
      const response = await fetch(
        `${server.url}..%2Fsecret.txt`,
      );

      expect([403, 404]).toContain(response.status);
    } finally {
      server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('basePath 路由与内部端点不受影响', async () => {
    const outDir = makeDist();
    const server = start(outDir, '/docs');

    try {
      const redirect = await fetch(
        `http://127.0.0.1:${server.port}/docs`,
        { redirect: 'manual' },
      );
      expect(redirect.status).toBe(308);
      expect(redirect.headers.get('location')).toBe(
        `http://127.0.0.1:${server.port}/docs/`,
      );

      const home = await fetch(
        `http://127.0.0.1:${server.port}/docs/`,
      );
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('<h1>Home</h1>');

      const outside = await fetch(
        `http://127.0.0.1:${server.port}/`,
      );
      expect(outside.status).toBe(404);

      const events = await fetch(
        `http://127.0.0.1:${server.port}/_wordma/events`,
      );
      expect(events.status).toBe(200);
      expect(events.headers.get('content-type')).toContain(
        'text/event-stream',
      );
    } finally {
      server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('SSE 首事件、诊断与 reload 广播', async () => {
    const outDir = makeDist();
    const server = start(outDir);
    let reader:
      | ReadableStreamDefaultReader<Uint8Array>
      | undefined;

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/_wordma/events`,
      );
      if (!response.body) throw new Error('缺少 SSE body');
      reader = response.body.getReader();

      const initial = await readSse(
        reader,
        'event: diagnostics',
      );
      expect(initial).toContain('retry: 1500');
      expect(initial).toContain('"diagnostics":[]');

      server.setDiagnostics([
        {
          code: 'MDX_PARSE_ERROR',
          severity: 'error',
          source: 'mdx',
          message: 'bad content',
          file: '/site/a.mdx',
          line: 3,
          column: 1,
        },
      ]);
      const diagnostics = await readSse(
        reader,
        'bad content',
      );
      expect(diagnostics).toContain(
        'event: diagnostics',
      );
      expect(diagnostics).toContain('MDX_PARSE_ERROR');

      server.publish({
        type: 'reload',
        buildId: 'build-1',
      });
      const reload = await readSse(reader, 'build-1');
      expect(reload).toContain('event: reload');
    } finally {
      await reader?.cancel();
      server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('初次失败返回覆盖层，ready 后恢复站点', async () => {
    const outDir = makeDist();
    const server = startDevServer({
      outDir,
      host: '127.0.0.1',
      port: 0,
      hasBuild: false,
      initialDiagnostics: [
        {
          code: 'MDX_PARSE_ERROR',
          severity: 'error',
          source: 'mdx',
          message: '<script>alert(1)</script>',
          file: '/site/a.mdx',
          line: 2,
          column: 3,
        },
        {
          code: 'MISSING_ASSET',
          severity: 'warning',
          source: 'content',
          message: 'missing image',
        },
      ],
    });

    try {
      const response = await fetch(`${server.url}`);
      const html = await response.text();

      expect(response.status).toBe(500);
      expect(html).toContain('MDX_PARSE_ERROR');
      expect(html).toContain('/site/a.mdx:2:3');
      expect(html).toContain('Warnings');
      expect(html).toContain('missing image');
      expect(html).toContain(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('/_wordma/client.js');

      const asset = await fetch(`${server.url}app.js`);
      expect(asset.status).toBe(404);

      server.setBuildState({
        hasBuild: true,
        diagnostics: [],
      });

      const ready = await fetch(`${server.url}`);
      expect(ready.status).toBe(200);
      expect(await ready.text()).toContain('<h1>Home</h1>');
    } finally {
      server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('提供 dev client 脚本', async () => {
    const outDir = makeDist();
    const server = start(outDir);

    try {
      const response = await fetch(
        `${server.url}_wordma/client.js`,
      );
      const script = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'text/javascript',
      );
      expect(script).toContain('EventSource');
      expect(script).toContain('wordma-dev-overlay');
      expect(script).toContain('Warnings');
      expect(script).toContain('#f0c674');
      expect(script).not.toContain('innerHTML');
      expect(script).toContain(
        'source.addEventListener(\'reload\'',
      );
    } finally {
      server.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
