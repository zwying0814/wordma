#!/usr/bin/env bun
import path from 'node:path';

import {
  CreateThemeError,
  createTheme,
} from './create-theme';

const help = `create-wordma-theme

用法:
  create-wordma-theme <id> [options]

选项:
  --root <dir>   工作区目录，默认当前目录
  --force        覆盖已存在目录中的生成文件
  --json         输出 JSON 事件
  -h, --help     显示帮助
`;

type Flags = {
  id?: string;
  root?: string;
  force: boolean;
  json: boolean;
  help: boolean;
};

function parse(args: string[]): Flags {
  const flags: Flags = {
    force: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === '--force') {
      flags.force = true;
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
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

    if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`);
    }

    if (flags.id) {
      throw new Error(`多余参数：${arg}`);
    }

    flags.id = arg;
  }

  return flags;
}

function emitJson(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event));
}

const args = process.argv.slice(2);

try {
  const flags = parse(args);

  if (flags.help) {
    console.log(help);
    process.exit(0);
  }

  if (!flags.id) {
    throw new Error('缺少主题 id');
  }

  const created = createTheme({
    id: flags.id,
    root: flags.root,
    force: flags.force,
  });
  const relativeTheme = path.relative(
    created.root,
    created.themeDir,
  );

  if (flags.json) {
    emitJson({
      v: 1,
      type: 'theme-created',
      themeId: created.id,
      path: created.themeDir,
      files: created.files,
    });
  } else {
    console.log(`Created ${relativeTheme}`);
    console.log('');
    console.log('下一步：');
    console.log('  pnpm install');
    console.log(
      `  pnpm --filter ${created.id} typecheck`,
    );
    console.log(
      `  wordma-engine dev --root ${created.root}`,
    );
  }
} catch (error) {
  const code =
    error instanceof CreateThemeError
      ? error.code
      : 'CREATE_THEME_FAILED';
  const message =
    error instanceof Error ? error.message : String(error);

  if (args.includes('--json')) {
    emitJson({
      v: 1,
      type: 'theme-create-error',
      error: { code, message },
    });
  } else {
    console.error(`[${code}] ${message}`);
  }

  process.exit(1);
}
