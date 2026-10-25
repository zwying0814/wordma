import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export type DevServerOptions = {
  outDir: string;
  host: string;
  port: number;
  basePath?: string;
};

export type DevServer = {
  url: string;
  port: number;
  close: () => void;
};

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

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function notFound(outDir: string): Response {
  const custom = path.join(outDir, '404.html');

  return existsSync(custom)
    ? new Response(Bun.file(custom), {
        status: 404,
        headers: {
          'content-type': MIME_TYPES['.html'] as string,
          'cache-control': 'no-store',
        },
      })
    : new Response('Not Found', {
        status: 404,
        headers: {
          'content-type': MIME_TYPES['.txt'] as string,
          'cache-control': 'no-store',
        },
      });
}

export function startDevServer(
  options: DevServerOptions,
): DevServer {
  const outDir = path.resolve(options.outDir);
  const basePath =
    options.basePath && options.basePath !== '/'
      ? `/${options.basePath.replace(/^\/+|\/+$/g, '')}`
      : '';

  let server: ReturnType<typeof Bun.serve>;

  try {
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      async fetch(request) {
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

        if (basePath) {
          if (pathname === basePath) {
            return Response.redirect(
              `${url.origin}${basePath}/`,
              308,
            );
          }
          if (!pathname.startsWith(`${basePath}/`)) {
            return notFound(outDir);
          }
          pathname = pathname.slice(basePath.length);
        }

        if (!pathname.startsWith('/')) {
          return new Response('Bad Request', { status: 400 });
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
            ? notFound(outDir)
            : new Response('Not Found', {
                status: 404,
              });
        }

        const headers = new Headers({
          'content-type':
            MIME_TYPES[
              path.extname(filePath).toLowerCase()
            ] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });

        if (request.method === 'HEAD') {
          return new Response(null, { headers });
        }

        return new Response(Bun.file(filePath), {
          headers,
        });
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
    close: () => {
      server.stop(true);
    },
  };
}
