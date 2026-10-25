import {
  existsSync,
  renameSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';

import { loadWorkspace } from '@wordma/content';

import { buildSite } from '../build';
import type { BuildResult } from '../build';
import { resolveThemeDirectory } from '../theme/resolve';
import type {
  BuildSuccessEvent,
  DevEventPayload,
  JsonDiagnostic,
} from './events';
import { startDevServer } from './server';
import type { DevServer } from './server';
import { startWatch } from './watch';
import type { WatchHandle } from './watch';

export type DevLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
  event?: (event: DevEventPayload) => void;
};

export type StartDevOptions = {
  root: string;
  outDir?: string;
  host?: string;
  port?: number;
  includeDrafts?: boolean;
  noWatch?: boolean;
  noCache?: boolean;
};

export type DevHandle = {
  url: string;
  port: number;
  outDir: string;
  closed: Promise<void>;
  close: () => void;
};

type LoopState = {
  building: boolean;
  pending: boolean;
  closed: boolean;
};

function promote(nextDir: string, outDir: string): void {
  const oldDir = `${outDir}.old`;

  rmSync(oldDir, { recursive: true, force: true });

  if (existsSync(outDir)) {
    renameSync(outDir, oldDir);
  }

  try {
    renameSync(nextDir, outDir);
  } catch (error) {
    if (existsSync(oldDir) && !existsSync(outDir)) {
      renameSync(oldDir, outDir);
    }
    throw error;
  }

  rmSync(oldDir, { recursive: true, force: true });
}

function errorEvent(error: unknown): JsonDiagnostic {
  if (error instanceof Error) {
    const detail = error as Error & {
      code?: string;
      file?: string;
      line?: number;
      column?: number;
      path?: string;
      exportName?: string;
    };

    return {
      code: detail.code ?? 'DEV_BUILD_FAILED',
      message: detail.message,
      ...(detail.file ? { file: detail.file } : {}),
      ...(detail.line !== undefined
        ? { line: detail.line }
        : {}),
      ...(detail.column !== undefined
        ? { column: detail.column }
        : {}),
      ...(detail.path ? { path: detail.path } : {}),
      ...(detail.exportName
        ? { exportName: detail.exportName }
        : {}),
    };
  }

  return {
    code: 'DEV_BUILD_FAILED',
    message: String(error),
  };
}

function buildSuccessEvent(
  result: BuildResult,
  durationMs: number,
): BuildSuccessEvent {
  return {
    type: 'build-success',
    durationMs,
    routes: result.routes,
    compiledEntries: result.compiledEntries,
    islands: result.islands,
    diagnostics: result.diagnostics,
    cache: result.cache,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const detail = error as Error & { code?: string };
    return `${detail.code ? `[${detail.code}] ` : ''}${detail.message}`;
  }

  return String(error);
}

/**
 * 启动 dev 生命周期：首次构建、预览服务、watch 与信号清理。
 */
export async function startDev(
  options: StartDevOptions,
  logger: DevLogger,
): Promise<DevHandle> {
  const root = path.resolve(options.root);
  const outDir = options.outDir
    ? path.resolve(options.outDir)
    : path.join(root, '.wordma/dev');
  const nextDir = `${outDir}.next`;
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4321;

  const runBuild = async (): Promise<{
    result: BuildResult;
    durationMs: number;
  }> => {
    const started = Date.now();
    const result = await buildSite({
      root,
      outDir: nextDir,
      includeDrafts: options.includeDrafts,
      cache: options.noCache ? false : true,
    });

    return {
      result,
      durationMs: Date.now() - started,
    };
  };

  let workspace: ReturnType<typeof loadWorkspace> | undefined;
  let initial:
    | { result: BuildResult; durationMs: number }
    | undefined;
  let initialError: unknown;

  try {
    workspace = loadWorkspace(root, {
      includeDrafts: options.includeDrafts,
    });
    initial = await runBuild();
    promote(nextDir, outDir);
  } catch (error) {
    initialError = error;
    rmSync(nextDir, { recursive: true, force: true });
  }

  const basePath = workspace?.site.site.basePath ?? '';
  const initialDiagnostics = initial
    ? initial.result.diagnostics
    : [errorEvent(initialError)];

  let server: DevServer;
  try {
    server = startDevServer({
      outDir,
      host,
      port,
      basePath,
      hasBuild: initial !== undefined,
      initialDiagnostics,
    });
  } catch (error) {
    rmSync(nextDir, { recursive: true, force: true });
    throw error;
  }

  if (initial) {
    logger.event?.(
      buildSuccessEvent(initial.result, initial.durationMs),
    );
  } else {
    logger.error(errorMessage(initialError));
    logger.event?.({
      type: 'build-error',
      durationMs: 0,
      diagnostics: initialDiagnostics,
    });
  }

  const state: LoopState = {
    building: false,
    pending: false,
    closed: false,
  };
  let watcher: WatchHandle | undefined;
  const pendingChanged = new Set<string>();

  let resolveClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const shutdown = (): void => {
    if (state.closed) return;
    state.closed = true;
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
    watcher?.close();
    watcher = undefined;
    server.close();
    rmSync(`${outDir}.old`, {
      recursive: true,
      force: true,
    });
    logger.event?.({ type: 'exit', code: 0 });
    logger.info('Dev server stopped');
    resolveClosed();
  };

  const rebuild = async (
    changed: string[],
  ): Promise<void> => {
    if (state.closed) return;
    if (state.building) {
      for (const item of changed) {
        pendingChanged.add(item);
      }
      state.pending = true;
      return;
    }

    state.building = true;

    try {
      logger.info(
        changed.length > 0
          ? `Rebuilding: ${changed.join(', ')}`
          : 'Rebuilding',
      );
      logger.event?.({
        type: 'build-start',
        reason: 'watch',
        ...(changed.length > 0 ? { changed } : {}),
      });

      const built = await runBuild();
      if (state.closed) return;

      promote(nextDir, outDir);
      logger.info(
        `Built ${built.result.routes} routes in ${built.durationMs}ms`,
      );
      server.setBuildState({
        hasBuild: true,
        diagnostics: built.result.diagnostics,
      });
      logger.event?.(
        buildSuccessEvent(built.result, built.durationMs),
      );
      const buildId = String(Date.now());
      server.publish({
        type: 'reload',
        buildId,
      });
      logger.event?.({
        type: 'reload',
        buildId,
      });
    } catch (error) {
      logger.error(errorMessage(error));
      server.setDiagnostics([errorEvent(error)]);
      logger.event?.({
        type: 'build-error',
        durationMs: 0,
        diagnostics: [errorEvent(error)],
      });
    } finally {
      state.building = false;
      if (state.pending && !state.closed) {
        state.pending = false;
        const next = [...pendingChanged].sort();
        pendingChanged.clear();
        void rebuild(next);
      }
    }
  };

  if (!options.noWatch) {
    const themeDirectory = workspace
      ? resolveThemeDirectory(
          root,
          workspace.site.theme.id,
        )
      : null;
    const relativeTheme = themeDirectory
      ? path.relative(root, themeDirectory)
      : '';
    const externalTheme =
      themeDirectory &&
      (relativeTheme.startsWith('..') ||
        path.isAbsolute(relativeTheme))
        ? [themeDirectory]
        : [];

    watcher = startWatch({
      root,
      additionalRoots: externalTheme,
      ignoredPaths: [
        outDir,
        nextDir,
        `${outDir}.old`,
        path.join(root, '.wordma'),
      ],
      onChange: (changed) => {
        if (state.closed) return;
        logger.event?.({ type: 'watch', changed });
        void rebuild(changed);
      },
      onError: (error) => {
        logger.error(`watch 启动失败：${errorMessage(error)}`);
      },
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  logger.info(`Dev server: ${server.url}`);
  logger.info(`Root: ${root}`);
  logger.info(
    options.noWatch ? 'Watch: disabled' : 'Watch: enabled',
  );
  logger.event?.({
    type: 'ready',
    url: server.url,
    root,
    outDir,
    basePath,
    watch: !options.noWatch,
  });

  return {
    url: server.url,
    port: server.port,
    outDir,
    closed,
    close: () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      shutdown();
    },
  };
}
