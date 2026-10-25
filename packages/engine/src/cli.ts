import { ContentError, YamlParseError } from '@wordma/content';
import { ZodError } from 'zod';

import { ENGINE_VERSION } from './index';
import { inspectWorkspace } from './inspect';

const help = `wordma-engine ${ENGINE_VERSION}

用法:
  wordma-engine <command> [options]

命令:
  inspect   输出站点与主题契约信息
  build     构建静态站点（尚未实现）
  dev       启动开发服务器（尚未实现）

inspect 选项:
  --root <path>   工作区目录，默认当前目录
  --json          输出 JSON

全局选项:
  -h, --help      显示帮助
  -v, --version   显示版本
`;

type InspectFlags = {
  root?: string;
  json?: boolean;
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

function formatError(error: unknown): string {
  if (error instanceof ContentError) {
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

try {
  switch (command) {
    case 'inspect':
      runInspect(args.slice(1));
      break;

    case 'build':
    case 'dev':
      console.error(`wordma-engine ${command} 尚未实现（M1 之后提供）`);
      process.exit(1);
      break;

    default:
      console.error(`未知命令：${command}`);
      console.error(help);
      process.exit(1);
  }
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}
