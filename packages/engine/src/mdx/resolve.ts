import {
  existsSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { MdxError } from '../errors';
import type { MdxImport, ParsedMdx } from './parse';

export type ResolvedMdxImport = MdxImport & {
  /** 解析后的真实绝对路径 */
  filePath: string;
  /** 相对 workspace 的 POSIX 路径 */
  relativePath: string;
  extension: string;
};

export type ResolveMdxImportsOptions = {
  workspaceRoot: string;
};

const SCRIPT_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
];

const builtins = new Set(builtinModules);

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function isBuiltin(source: string): boolean {
  return (
    source.startsWith('node:') ||
    source.startsWith('bun:') ||
    source === 'bun' ||
    builtins.has(source)
  );
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFileCandidate(candidate: string): string | undefined {
  if (isFile(candidate)) return candidate;

  for (const extension of SCRIPT_EXTENSIONS) {
    const withExtension = `${candidate}${extension}`;
    if (isFile(withExtension)) return withExtension;
  }

  if (
    existsSync(candidate) &&
    statSync(candidate).isDirectory()
  ) {
    for (const extension of SCRIPT_EXTENSIONS) {
      const indexFile = path.join(
        candidate,
        `index${extension}`,
      );
      if (isFile(indexFile)) return indexFile;
    }
  }

  return undefined;
}

function importError(
  code: string,
  message: string,
  imported: MdxImport,
  options: { filePath: string },
): MdxError {
  return new MdxError(
    code,
    `${message}：${imported.source}`,
    {
      file: options.filePath,
      line: imported.line,
      column: imported.column,
    },
  );
}

function realpathOrResolve(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function resolveImport(
  imported: MdxImport,
  options: { filePath: string; workspaceRoot: string },
): ResolvedMdxImport {
  if (isBuiltin(imported.source)) {
    throw importError(
      'UNSAFE_IMPORT',
      '不允许导入 Node/Bun 内置模块',
      imported,
      options,
    );
  }

  if (path.isAbsolute(imported.source)) {
    throw importError(
      'UNSAFE_IMPORT',
      '不允许使用绝对路径 import',
      imported,
      options,
    );
  }

  const workspaceRoot = realpathSync(options.workspaceRoot);
  const filePath = path.resolve(options.filePath);
  const baseDirectory = realpathOrResolve(
    path.dirname(filePath),
  );
  const isRelative =
    imported.source.startsWith('./') ||
    imported.source.startsWith('../');

  let resolved: string;

  if (isRelative) {
    const candidate = path.resolve(
      baseDirectory,
      imported.source,
    );

    if (!isInside(workspaceRoot, candidate)) {
      throw importError(
        'UNSAFE_IMPORT',
        'import 不能逃出 workspace',
        imported,
        options,
      );
    }

    const found = resolveFileCandidate(candidate);

    if (!found) {
      throw importError(
        'MISSING_COMPONENT_SOURCE',
        '找不到组件文件',
        imported,
        options,
      );
    }

    resolved = found;
  } else {
    try {
      resolved = Bun.resolveSync(
        imported.source,
        baseDirectory,
      );
    } catch {
      throw importError(
        'MISSING_COMPONENT_SOURCE',
        '无法解析依赖',
        imported,
        options,
      );
    }

    if (resolved.startsWith('node:') || resolved.startsWith('bun:')) {
      throw importError(
        'UNSAFE_IMPORT',
        '不允许导入 Node/Bun 内置模块',
        imported,
        options,
      );
    }
  }

  let realPath: string;

  try {
    realPath = realpathSync(resolved);
  } catch {
    throw importError(
      'MISSING_COMPONENT_SOURCE',
      '组件文件不存在',
      imported,
      options,
    );
  }

  if (!isInside(workspaceRoot, realPath)) {
    throw importError(
      'UNSAFE_IMPORT',
      'import 解析结果位于 workspace 外',
      imported,
      options,
    );
  }

  const extension = path.extname(realPath).toLowerCase();

  if (!SCRIPT_EXTENSIONS.includes(extension)) {
    throw importError(
      'UNSUPPORTED_IMPORT',
      `不支持的组件扩展名 ${extension || '(无)'}`,
      imported,
      options,
    );
  }

  return {
    ...imported,
    filePath: realPath,
    relativePath: toPosix(
      path.relative(workspaceRoot, realPath),
    ),
    extension,
  };
}

/**
 * 将 MDX 中的 import 绑定解析为 workspace 内的真实组件路径。
 *
 * 只做路径解析与安全校验，不加载或执行组件模块。
 */
export function resolveMdxImports(
  parsed: ParsedMdx,
  options: ResolveMdxImportsOptions,
): ResolvedMdxImport[] {
  const workspaceRoot = realpathSync(options.workspaceRoot);

  return parsed.imports.map((imported) =>
    resolveImport(imported, {
      filePath: parsed.filePath,
      workspaceRoot,
    }),
  );
}
