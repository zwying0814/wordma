import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { PackageNameSchema } from '@wordma/content';

import {
  themeTemplates,
} from './templates';
import type { ThemeTemplateOptions } from './templates';

export type CreateThemeOptions = {
  id: string;
  root?: string;
  force?: boolean;
};

export type CreatedTheme = {
  id: string;
  root: string;
  themeDir: string;
  files: string[];
};

export class CreateThemeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CreateThemeError';
    this.code = code;
  }
}

function displayName(id: string): string {
  const base = id.replace(/^wordma-theme-/, '');
  const words = base
    .split(/[-_.]+/)
    .filter(Boolean)
    .map(
      (word) =>
        `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    );

  return words.join(' ') || id;
}

function validateId(id: string): void {
  if (id.startsWith('@')) {
    throw new CreateThemeError(
      'SCOPED_THEME_UNSUPPORTED',
      '暂不支持 scoped 主题 id，请使用 wordma-theme-name 形式',
    );
  }

  if (!PackageNameSchema.safeParse(id).success) {
    throw new CreateThemeError(
      'INVALID_THEME_ID',
      `主题 id 不是合法的 npm 包名：${id}`,
    );
  }
}

function targetState(
  themeDir: string,
): 'missing' | 'empty' | 'non-empty' {
  if (!existsSync(themeDir)) return 'missing';

  const stat = lstatSync(themeDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new CreateThemeError(
      'UNSAFE_THEME_PATH',
      `主题路径不是普通目录：${themeDir}`,
    );
  }

  return readdirSync(themeDir).length === 0
    ? 'empty'
    : 'non-empty';
}

export function createTheme(
  options: CreateThemeOptions,
): CreatedTheme {
  const id = options.id.trim();
  validateId(id);

  const root = path.resolve(options.root ?? process.cwd());

  if (existsSync(root) && !statSync(root).isDirectory()) {
    throw new CreateThemeError(
      'INVALID_ROOT',
      `工作区不是目录：${root}`,
    );
  }

  const themesDir = path.join(root, 'themes');
  const themeDir = path.join(themesDir, id);
  const relative = path.relative(themesDir, themeDir);

  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new CreateThemeError(
      'UNSAFE_THEME_PATH',
      `主题路径超出 themes 目录：${themeDir}`,
    );
  }

  const state = targetState(themeDir);

  if (state === 'non-empty' && !options.force) {
    throw new CreateThemeError(
      'TARGET_NOT_EMPTY',
      `主题目录已存在且非空：${themeDir}（使用 --force 覆盖生成文件）`,
    );
  }

  mkdirSync(themeDir, { recursive: true });

  const templateOptions: ThemeTemplateOptions = {
    id,
    displayName: displayName(id),
  };
  const templates = themeTemplates(templateOptions);
  const files = Object.keys(templates).sort();

  for (const [relativePath, content] of Object.entries(
    templates,
  )) {
    const file = path.join(themeDir, relativePath);
    mkdirSync(path.dirname(file), {
      recursive: true,
    });
    writeFileSync(file, content);
  }

  return {
    id,
    root,
    themeDir,
    files,
  };
}
