import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { JsonDiagnostic } from './events';

export type DevServerEvent =
  | {
      type: 'reload';
      buildId: string;
    }
  | {
      type: 'diagnostics';
      diagnostics: JsonDiagnostic[];
    };

export type DevServerOptions = {
  outDir: string;
  host: string;
  port: number;
  basePath?: string;
  hasBuild?: boolean;
  initialDiagnostics?: JsonDiagnostic[];
};

export type BuildState = {
  hasBuild: boolean;
  diagnostics: JsonDiagnostic[];
};

export type DevServer = {
  url: string;
  port: number;
  publish: (event: DevServerEvent) => void;
  setDiagnostics: (diagnostics: JsonDiagnostic[]) => void;
  setBuildState: (state: BuildState) => void;
  close: () => void;
};

const EVENTS_PATH = '/_wordma/events';
const CLIENT_PATH = '/_wordma/client.js';
const CLIENT_SNIPPET =
  '<script type="module" src="/_wordma/client.js"></script>';
const PREVIEW_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data: https:",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const CLIENT_SCRIPT = `(() => {
  const overlayId = 'wordma-dev-overlay';

  function hideOverlay() {
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();
  }

  function renderGroup(overlay, titleText, color, items) {
    if (items.length === 0) return;

    const groupTitle = document.createElement('h3');
    groupTitle.textContent = titleText;
    groupTitle.setAttribute(
      'style',
      'margin:20px 0 10px;font-size:15px;color:' + color + ';'
    );
    overlay.appendChild(groupTitle);

    for (const diagnostic of items) {
      const block = document.createElement('pre');
      block.setAttribute(
        'style',
        'margin:0 0 12px;padding:12px;white-space:pre-wrap;background:#1b1e25;border:1px solid #333843;border-radius:6px;'
      );
      const location = diagnostic.file
        ? diagnostic.file +
          (diagnostic.line == null ? '' : ':' + diagnostic.line) +
          (diagnostic.column == null ? '' : ':' + diagnostic.column)
        : '';
      block.textContent =
        '[' + diagnostic.code + '] ' + diagnostic.message +
        (location ? '\\n' + location : '');
      overlay.appendChild(block);
    }
  }

  function showOverlay(diagnostics) {
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.setAttribute(
        'style',
        'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#111318;color:#f5f5f5;padding:24px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;'
      );
      document.body.appendChild(overlay);
    }

    overlay.textContent = '';
    const title = document.createElement('h2');
    title.textContent = 'Wordma build failed';
    title.setAttribute('style', 'margin:0 0 16px;font-size:18px;color:#ff8a8a;');
    overlay.appendChild(title);

    const errors = diagnostics.filter(
      (item) => !item.severity || item.severity === 'error'
    );
    const warnings = diagnostics.filter(
      (item) => item.severity === 'warning'
    );

    renderGroup(overlay, 'Errors', '#ff8a8a', errors);
    renderGroup(overlay, 'Warnings', '#f0c674', warnings);
  }

  const source = new EventSource('${EVENTS_PATH}');

  source.addEventListener('reload', () => {
    location.reload();
  });

  source.addEventListener('diagnostics', (event) => {
    try {
      const data = JSON.parse(event.data);
      const diagnostics = Array.isArray(data.diagnostics)
        ? data.diagnostics
        : [];
      const errors = diagnostics.filter(
        (item) => !item.severity || item.severity === 'error'
      );
      if (errors.length > 0) showOverlay(diagnostics);
      else hideOverlay();
    } catch {
      // ignore malformed events
    }
  });
})();
`;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function injectDevClient(html: string): string {
  const index = html.toLowerCase().lastIndexOf('</body>');

  if (index === -1) {
    return `${html}${CLIENT_SNIPPET}`;
  }

  return `${html.slice(0, index)}${CLIENT_SNIPPET}${html.slice(index)}`;
}

function sseMessage(
  type: string,
  data: unknown,
): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function diagnosticText(diagnostic: JsonDiagnostic): string {
  const location = diagnostic.file
    ? `${diagnostic.file}${
        diagnostic.line === undefined
          ? ''
          : `:${diagnostic.line}${
              diagnostic.column === undefined
                ? ''
                : `:${diagnostic.column}`
            }`
      }`
    : '';

  return `[${diagnostic.code}] ${diagnostic.message}${
    location ? `\n${location}` : ''
  }`;
}

function errorPageHtml(
  diagnostics: JsonDiagnostic[],
): string {
  const errors = diagnostics.filter(
    (item) =>
      !item.severity || item.severity === 'error',
  );
  const warnings = diagnostics.filter(
    (item) => item.severity === 'warning',
  );
  const group = (
    title: string,
    color: string,
    items: JsonDiagnostic[],
  ): string =>
    items.length === 0
      ? ''
      : `<h2 style="color:${color};font-size:16px;margin:20px 0 10px">${title}</h2>${items
          .map(
            (item) =>
              `<pre style="margin:0 0 12px;padding:12px;white-space:pre-wrap;background:#1b1e25;border:1px solid #333843;border-radius:6px">${escapeHtml(
                diagnosticText(item),
              )}</pre>`,
          )
          .join('')}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wordma build failed</title>
</head>
<body style="margin:0;background:#111318;color:#f5f5f5;padding:24px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace">
<h1 style="margin:0 0 16px;font-size:18px;color:#ff8a8a">Wordma build failed</h1>
${group('Errors', '#ff8a8a', errors)}
${group('Warnings', '#f0c674', warnings)}
<script type="module" src="/_wordma/client.js"></script>
</body>
</html>`;
}

export function startDevServer(
  options: DevServerOptions,
): DevServer {
  const outDir = path.resolve(options.outDir);
  const basePath =
    options.basePath && options.basePath !== '/'
      ? `/${options.basePath.replace(/^\/+|\/+$/g, '')}`
      : '';
  const encoder = new TextEncoder();
  const clients = new Set<
    ReadableStreamDefaultController<Uint8Array>
  >();
  let hasBuild =
    options.hasBuild ??
    existsSync(path.join(outDir, 'index.html'));
  let diagnostics: JsonDiagnostic[] =
    options.initialDiagnostics ?? [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const closeClient = (
    client: ReadableStreamDefaultController<Uint8Array>,
  ): void => {
    clients.delete(client);
    if (clients.size === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

  const publish = (event: DevServerEvent): void => {
    if (event.type === 'diagnostics') {
      diagnostics = event.diagnostics;
    }

    const payload = encoder.encode(
      sseMessage(event.type, event),
    );

    for (const client of [...clients]) {
      try {
        client.enqueue(payload);
      } catch {
        closeClient(client);
      }
    }
  };

  const setDiagnostics = (
    next: JsonDiagnostic[],
  ): void => {
    publish({ type: 'diagnostics', diagnostics: next });
  };

  const setBuildState = (next: BuildState): void => {
    hasBuild = next.hasBuild;
    publish({
      type: 'diagnostics',
      diagnostics: next.diagnostics,
    });
  };

  const responseForFile = (
    filePath: string,
    status: number,
    method: string,
  ): Response => {
    const extension = path
      .extname(filePath)
      .toLowerCase();
    const headers = new Headers({
      'content-type':
        MIME_TYPES[extension] ??
        'application/octet-stream',
      'cache-control': 'no-store',
    });

    if (extension === '.html') {
      headers.set('content-security-policy', PREVIEW_CSP);

      if (method === 'HEAD') {
        return new Response(null, { status, headers });
      }

      const html = injectDevClient(
        readFileSync(filePath, 'utf8'),
      );
      return new Response(html, { status, headers });
    }

    if (method === 'HEAD') {
      return new Response(null, { status, headers });
    }

    return new Response(Bun.file(filePath), {
      status,
      headers,
    });
  };

  const notFound = (method: string): Response => {
    const custom = path.join(outDir, '404.html');

    return existsSync(custom)
      ? responseForFile(custom, 404, method)
      : new Response('Not Found', {
          status: 404,
          headers: {
            'content-type': MIME_TYPES['.txt'] as string,
            'cache-control': 'no-store',
          },
        });
  };

  let server: ReturnType<typeof Bun.serve>;

  try {
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      async fetch(request) {
        const method = request.method.toUpperCase();

        if (method !== 'GET' && method !== 'HEAD') {
          return new Response('Method Not Allowed', {
            status: 405,
            headers: {
              allow: 'GET, HEAD',
            },
          });
        }

        const url = new URL(request.url);
        let pathname: string;

        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          return new Response('Bad Request', { status: 400 });
        }

        if (pathname.includes('\0')) {
          return new Response('Bad Request', { status: 400 });
        }

        if (pathname === EVENTS_PATH) {
          let clientController:
            | ReadableStreamDefaultController<Uint8Array>
            | undefined;

          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              clientController = controller;
              clients.add(controller);
              controller.enqueue(
                encoder.encode('retry: 1500\n\n'),
              );
              controller.enqueue(
                encoder.encode(
                  sseMessage('diagnostics', {
                    type: 'diagnostics',
                    diagnostics,
                  }),
                ),
              );

              if (!heartbeat) {
                heartbeat = setInterval(() => {
                  const ping = encoder.encode(': ping\n\n');
                  for (const client of [...clients]) {
                    try {
                      client.enqueue(ping);
                    } catch {
                      closeClient(client);
                    }
                  }
                }, 15000);
              }
            },
            cancel() {
              if (clientController) {
                closeClient(clientController);
              }
            },
          });

          return new Response(stream, {
            headers: {
              'content-type':
                'text/event-stream; charset=utf-8',
              'cache-control': 'no-store',
              connection: 'keep-alive',
            },
          });
        }

        if (pathname === CLIENT_PATH) {
          return method === 'HEAD'
            ? new Response(null, {
                headers: {
                  'content-type':
                    MIME_TYPES['.js'] as string,
                  'cache-control': 'no-store',
                },
              })
            : new Response(CLIENT_SCRIPT, {
                headers: {
                  'content-type':
                    MIME_TYPES['.js'] as string,
                  'cache-control': 'no-store',
                },
              });
        }

        if (basePath) {
          if (pathname === basePath) {
            return Response.redirect(
              `${url.origin}${basePath}/`,
              308,
            );
          }
          if (!pathname.startsWith(`${basePath}/`)) {
            return notFound(method);
          }
          pathname = pathname.slice(basePath.length);
        }

        if (!pathname.startsWith('/')) {
          return new Response('Bad Request', { status: 400 });
        }

        if (!hasBuild) {
          const wantsHtml =
            request.headers
              .get('accept')
              ?.includes('text/html') ||
            pathname.endsWith('/') ||
            !path.extname(pathname);

          if (wantsHtml) {
            const headers = {
              'content-type': MIME_TYPES['.html'] as string,
              'cache-control': 'no-store',
              'content-security-policy': PREVIEW_CSP,
            };

            return method === 'HEAD'
              ? new Response(null, {
                  status: 500,
                  headers,
                })
              : new Response(
                  errorPageHtml(diagnostics),
                  {
                    status: 500,
                    headers,
                  },
                );
          }

          return new Response('Not Found', { status: 404 });
        }

        const target = path.resolve(
          outDir,
          `.${pathname}`,
        );

        if (!isInside(outDir, target)) {
          return new Response('Forbidden', { status: 403 });
        }

        let filePath = target;

        try {
          if (statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
          }
        } catch {
          filePath = path.join(target, 'index.html');
        }

        if (!existsSync(filePath)) {
          return pathname.endsWith('/') ||
            !path.extname(pathname)
            ? notFound(method)
            : new Response('Not Found', { status: 404 });
        }

        return responseForFile(filePath, 200, method);
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法启动 dev server（${options.host}:${options.port}）：${message}`,
    );
  }

  const host =
    options.host === '0.0.0.0' ? '127.0.0.1' : options.host;
  const actualPort = server.port ?? options.port;

  return {
    url: `http://${host}:${actualPort}${basePath}/`,
    port: actualPort,
    publish,
    setDiagnostics,
    setBuildState,
    close: () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = undefined;
      }
      for (const client of [...clients]) {
        try {
          client.close();
        } catch {
          // ignore
        }
      }
      clients.clear();
      server.stop(true);
    },
  };
}
