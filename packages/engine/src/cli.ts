import { ContentError, YamlParseError } from '@wordma/content';
import { ZodError } from 'zod';

import { buildSite } from './build';
import { startDev } from './dev';
import { EventWriter } from './dev/events';
import type { JsonDiagnostic } from './dev/events';
import {
  BuildError,
  IslandError,
  MdxError,
  RouteError,
  ThemeError,
} from './errors';
import { ENGINE_VERSION } from './index';
import { inspectWorkspace } from './inspect';

const help = `wordma-engine ${ENGINE_VERSION}

用法:
  wordma-engine <command> [options]

命令:
  inspect   输出站点与主题契约信息
  build     构建静态站点
  dev       启动开发服务器（尚未实现）

inspect 选项:
  --root <path>   工作区目录，默认当前目录
  --json          输出 JSON

build 选项:
  --root <path>     工作区目录，默认当前目录
  --out <path>      输出目录，默认 <root>/.wordma/dist
  --include-drafts  包含草稿
  --json            输出 NDJSON 事件
  --no-cache        禁用构建缓存

dev 选项:
  --root <path>     工作区目录，默认当前目录
  --out <path>      输出目录，默认 <root>/.wordma/dev
  --port <number>   监听端口，默认 4321
  --host <host>     监听地址，默认 127.0.0.1
  --include-drafts  包含草稿
  --json            输出 NDJSON 事件
  --no-watch        不监听文件变化
  --no-cache        禁用构建缓存

全局选项:
  -h, --help      显示帮助
  -v, --version   显示版本
`;

type InspectFlags = {
  root?: string;
  json?: boolean;
};

type BuildFlags = {
  root?: string;
  out?: string;
  includeDrafts?: boolean;
  json?: boolean;
  noCache?: boolean;
};

type DevFlags = {
  root?: string;
  out?: string;
  port?: number;
  host?: string;
  includeDrafts?: boolean;
  json?: boolean;
  noWatch?: boolean;
  noCache?: boolean;
};

function parseInspectFlags(args: string[]): InspectFlags {
  const flags: InspectFlags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === '--json') {
      flags.json = true;
      continue;
    }

    if (arg === '--root') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--root 需要一个目录路径');
      }
      flags.root = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--root=')) {
      flags.root = arg.slice('--root='.length);
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  return flags;
}

function parseBuildFlags(args: string[]): BuildFlags {
  const flags: BuildFlags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === '--include-drafts') {
      flags.includeDrafts = true;
      continue;
    }

    if (arg === '--json') {
      flags.json = true;
      continue;
    }

    if (arg === '--no-cache') {
      flags.noCache = true;
      continue;
    }

    if (arg === '--root' || arg === '--out') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} 需要一个路径`);
      }

      if (arg === '--root') flags.root = value;
      else flags.out = value;

      index += 1;
      continue;
    }

    if (arg.startsWith('--root=')) {
      flags.root = arg.slice('--root='.length);
      continue;
    }

    if (arg.startsWith('--out=')) {
      flags.out = arg.slice('--out='.length);
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  return flags;
}

function formatSourceLocation(
  file: string | undefined,
  line: number | undefined,
  column: number | undefined,
): string {
  if (!file) return '';

  const position =
    line === undefined
      ? file
      : `${file}:${line}${column === undefined ? '' : `:${column}`}`;

  return `\n  at ${position}`;
}

function parseDevFlags(args: string[]): DevFlags {
  const flags: DevFlags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === '--include-drafts') {
      flags.includeDrafts = true;
      continue;
    }

    if (arg === '--json') {
      flags.json = true;
      continue;
    }

    if (arg === '--no-watch') {
      flags.noWatch = true;
      continue;
    }

    if (arg === '--no-cache') {
      flags.noCache = true;
      continue;
    }

    if (arg === '--root' || arg === '--out' || arg === '--host') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} 需要一个值`);
      }

      if (arg === '--root') flags.root = value;
      else if (arg === '--out') flags.out = value;
      else flags.host = value;

      index += 1;
      continue;
    }

    if (arg === '--port') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--port 需要一个端口号');
      }
      const port = Number(value);
      if (
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        throw new Error(`无效端口：${value}`);
      }
      flags.port = port;
      index += 1;
      continue;
    }

    if (arg.startsWith('--root=')) {
      flags.root = arg.slice('--root='.length);
      continue;
    }

    if (arg.startsWith('--out=')) {
      flags.out = arg.slice('--out='.length);
      continue;
    }

    if (arg.startsWith('--host=')) {
      flags.host = arg.slice('--host='.length);
      continue;
    }

    if (arg.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      const port = Number(value);
      if (
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        throw new Error(`无效端口：${value}`);
      }
      flags.port = port;
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  return flags;
}

function formatError(error: unknown): string {
  if (error instanceof MdxError) {
    return `[${error.code}] ${error.message}${formatSourceLocation(
      error.file,
      error.line,
      error.column,
    )}`;
  }

  if (error instanceof IslandError) {
    const exportName = error.exportName
      ? `\n  export: ${error.exportName}`
      : '';

    return `[${error.code}] ${error.message}${formatSourceLocation(
      error.file,
      undefined,
      undefined,
    )}${exportName}`;
  }

  if (
    error instanceof ContentError ||
    error instanceof ThemeError ||
    error instanceof RouteError ||
    error instanceof BuildError
  ) {
    return `[${error.code}] ${error.message}`;
  }

  if (error instanceof YamlParseError) {
    return error.diagnostics
      .map(
        (diagnostic) =>
          `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}`,
      )
      .join('\n');
  }

  if (error instanceof ZodError) {
    return error.issues
      .map(
        (issue) =>
          `- ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}

function runInspect(args: string[]): void {
  const flags = parseInspectFlags(args);
  const result = inspectWorkspace(flags.root ?? process.cwd());

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Workspace: ${result.workspace}`);
  console.log(
    `Site: ${result.site.title} (${result.site.language}, basePath=${result.site.basePath || '/'})`,
  );
  console.log(
    result.theme
      ? `Theme: ${result.theme.id}@${result.theme.version} (${result.theme.path})`
      : `Theme: ${result.themeId} (未安装)`,
  );
  console.log(`Post fields: ${result.postFields.length}`);
  console.log(`Page fields: ${result.pageFields.length}`);
  console.log(`Page types: ${result.pageTypes.length}`);
  console.log(`Pages: ${result.pages.length}`);
  console.log(
    result.collections.length > 0
      ? `Collections: ${result.collections
          .map((collection) => `${collection.name}(${collection.count})`)
          .join(', ')}`
      : 'Collections: (none)',
  );
  console.log(`Tags: ${result.tags.length}`);
  console.log(`Categories: ${result.categories.length}`);
  console.log(`Diagnostics: ${result.diagnostics.length}`);
}

function errorPayload(
  error: unknown,
): JsonDiagnostic {
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
      code: detail.code ?? 'ERROR',
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
    code: 'ERROR',
    message: String(error),
  };
}

const jsonWriter = new EventWriter();

async function runBuild(args: string[]): Promise<void> {
  const flags = parseBuildFlags(args);
  const started = Date.now();
  const result = await buildSite({
    root: flags.root ?? process.cwd(),
    outDir: flags.out,
    includeDrafts: flags.includeDrafts,
  });
  const durationMs = Date.now() - started;

  if (flags.json) {
    jsonWriter.emit({
      type: 'build-success',
      durationMs,
      routes: result.routes,
      compiledEntries: result.compiledEntries,
      islands: result.islands,
      diagnostics: result.diagnostics,
    });
    return;
  }

  console.log(
    `Built ${result.routes} routes to ${result.outDir}`,
  );
  console.log(
    `Theme: ${result.theme.id}@${result.theme.version}`,
  );
  if (result.diagnostics.length > 0) {
    console.log(
      `Diagnostics: ${result.diagnostics.length}`,
    );
  }
}

async function runDev(args: string[]): Promise<void> {
  const flags = parseDevFlags(args);
  const json = flags.json === true;

  const dev = await startDev(
    {
      root: flags.root ?? process.cwd(),
      outDir: flags.out,
      port: flags.port,
      host: flags.host,
      includeDrafts: flags.includeDrafts,
      noWatch: flags.noWatch,
      noCache: flags.noCache,
    },
    json
      ? {
          info: (message) => {
            console.error(message);
          },
          error: (message) => {
            console.error(message);
          },
          event: (event) => {
            jsonWriter.emit(event);
          },
        }
      : {
          info: (message) => {
            console.log(message);
          },
          error: (message) => {
            console.error(message);
          },
        },
  );

  await dev.closed;
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(help);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(`wordma-engine ${ENGINE_VERSION}`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}

const jsonMode = args.includes('--json');

try {
  switch (command) {
    case 'inspect':
      runInspect(args.slice(1));
      break;

    case 'build':
      await runBuild(args.slice(1));
      break;

    case 'dev':
      await runDev(args.slice(1));
      break;

    default:
      console.error(`未知命令：${command}`);
      console.error(help);
      process.exit(1);
  }
} catch (error) {
  if (jsonMode) {
    jsonWriter.emit({
      type: 'build-error',
      durationMs: 0,
      diagnostics: [errorPayload(error)],
    });
    if (command === 'dev') {
      jsonWriter.emit({ type: 'exit', code: 1 });
    }
  } else {
    console.error(formatError(error));
  }
  process.exit(1);
}
