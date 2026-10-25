import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assetUrl } from '../assets';
import { IslandError } from '../errors';
import type { IslandReference } from './analyze';
import {
  islandExportName,
  islandKey,
} from './identity';
import type { IslandAsset } from './identity';

export type IslandBundleInput = {
  source: string;
  relativeSource: string;
  exportName: string;
  importedName: string;
  propertyPath: string[];
  name: string;
};

export type IslandBundle = {
  key: string;
  name: string;
  source: string;
  relativeSource: string;
  exportName: string;
  importedName: string;
  propertyPath: string[];
  /** HTML 中的 URL（已含 basePath） */
  js: string;
  css?: string;
  /** 构建缓存中的文件路径，用于复制到 dist */
  jsPath: string;
  cssPath?: string;
  bytes: number;
};

export type IslandBuildResult = {
  bundles: IslandBundle[];
  assets: Map<string, IslandAsset>;
};

export type BuildIslandBundlesOptions = {
  workspaceRoot: string;
  cacheDir: string;
  basePath?: string;
};

const SCRIPT_EXTENSIONS = new Set([
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
]);
const builtins = new Set(builtinModules);
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isBuiltin(source: string): boolean {
  return (
    source.startsWith('node:') ||
    source.startsWith('bun:') ||
    source === 'bun' ||
    builtins.has(source)
  );
}

function isReactSpecifier(source: string): boolean {
  return /^react(?:-dom)?(?:\/|$)/.test(source);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function loaderFor(filePath: string): 'tsx' | 'ts' | 'jsx' | 'js' {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return 'tsx';
    case '.ts':
      return 'ts';
    case '.jsx':
      return 'jsx';
    default:
      return 'js';
  }
}

function islandError(
  code: string,
  message: string,
  file: string,
  exportName?: string,
): IslandError {
  return new IslandError(code, message, {
    file,
    exportName,
  });
}

function scanUnsafeImports(
  filePath: string,
  workspaceRoot: string,
  visited: Set<string>,
  exportName?: string,
): void {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  const extension = path.extname(filePath).toLowerCase();
  if (!SCRIPT_EXTENSIONS.has(extension)) return;

  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    throw islandError(
      'ISLAND_BUILD_FAILED',
      `无法读取组件：${filePath}`,
      filePath,
      exportName,
    );
  }

  let imports: Array<{ path: string }>;
  try {
    imports = new Bun.Transpiler({
      loader: loaderFor(filePath),
    }).scanImports(source);
  } catch (error) {
    throw islandError(
      'ISLAND_BUILD_FAILED',
      `无法解析组件：${filePath}\n${error instanceof Error ? error.message : String(error)}`,
      filePath,
      exportName,
    );
  }

  for (const imported of imports) {
    const specifier = imported.path;

    if (isBuiltin(specifier)) {
      throw islandError(
        'UNSAFE_IMPORT',
        `不允许导入 Node/Bun 内置模块：${specifier}`,
        filePath,
        exportName,
      );
    }

    if (isReactSpecifier(specifier)) continue;

    const isPathLike =
      specifier.startsWith('.') ||
      specifier.startsWith('/') ||
      specifier.startsWith('file:');

    let resolved: string;
    try {
      resolved = isPathLike
        ? specifier.startsWith('file:')
          ? fileURLToPath(specifier)
          : path.isAbsolute(specifier)
            ? specifier
            : Bun.resolveSync(
                specifier,
                path.dirname(filePath),
              )
        : Bun.resolveSync(
            specifier,
            path.dirname(filePath),
          );
    } catch {
      throw islandError(
        'ISLAND_BUILD_FAILED',
        `无法解析 import：${specifier}`,
        filePath,
        exportName,
      );
    }

    let realPath: string;
    try {
      realPath = realpathSync(resolved);
    } catch {
      throw islandError(
        'ISLAND_BUILD_FAILED',
        `import 文件不存在：${specifier}`,
        filePath,
        exportName,
      );
    }

    if (!isInside(workspaceRoot, realPath)) {
      throw islandError(
        'UNSAFE_IMPORT',
        `import 解析结果位于 workspace 外：${specifier}`,
        filePath,
        exportName,
      );
    }

    if (!isPathLike) continue;

    if (
      SCRIPT_EXTENSIONS.has(
        path.extname(realPath).toLowerCase(),
      )
    ) {
      scanUnsafeImports(
        realPath,
        workspaceRoot,
        visited,
        exportName,
      );
    }
  }
}

function assertIdentifier(
  value: string,
  input: IslandBundleInput,
  label: string,
): void {
  if (!IDENTIFIER.test(value)) {
    throw islandError(
      'UNSUPPORTED_IMPORT',
      `${label} 不是合法标识符：${value}`,
      input.source,
      input.exportName,
    );
  }
}

function entrySource(input: IslandBundleInput): string {
  const specifier = JSON.stringify(
    input.source.replace(/\\/g, '/'),
  );
  const propertyPath = input.propertyPath;

  assertIdentifier(input.name.split('.')[0] ?? '', input, '组件名');
  if (input.importedName !== 'default') {
    assertIdentifier(
      input.importedName,
      input,
      '导出名',
    );
  }
  for (const segment of propertyPath) {
    assertIdentifier(segment, input, '属性路径');
  }

  const clause =
    input.importedName === 'default'
      ? 'IslandComponent'
      : `{ ${input.importedName} as IslandComponent }`;
  const lines = [
    `import ${clause} from ${specifier};`,
  ];

  if (propertyPath.length > 0) {
    lines.push(
      `const Component = IslandComponent.${propertyPath.join('.')};`,
    );
  } else {
    lines.push('const Component = IslandComponent;');
  }
  lines.push('export default Component;');

  return `${lines.join('\n')}\n`;
}

function entryName(input: IslandBundleInput): string {
  const hash = createHash('sha256')
    .update(islandKey(input.source, input.exportName))
    .digest('hex')
    .slice(0, 16);

  return `island-${hash}`;
}

type BuildLogLike = {
  message: string;
  position?: {
    file?: string;
    line?: number;
    column?: number;
  } | null;
};

function formatBuildLog(log: BuildLogLike): string {
  const position = log.position;
  const location = position?.file
    ? `${position.file}${position.line === undefined ? '' : `:${position.line}${position.column === undefined ? '' : `:${position.column}`}`}`
    : '';

  return location
    ? `${location} ${log.message}`
    : log.message;
}

function buildError(
  input: IslandBundleInput,
  error: unknown,
  logs: BuildLogLike[] = [],
): IslandError {
  const aggregate = error as {
    errors?: BuildLogLike[];
  };
  const details = [
    ...(aggregate?.errors ?? []),
    ...logs,
  ]
    .map(formatBuildLog)
    .filter(Boolean);
  const detail =
    details.length > 0
      ? [...new Set(details)].join('\n')
      : error instanceof Error
        ? error.message
        : String(error);

  return islandError(
    'ISLAND_BUILD_FAILED',
    `岛屿打包失败：${input.source}\n${detail}`,
    input.source,
    input.exportName,
  );
}

function contentHash(source: string): string {
  return createHash('sha256')
    .update(source)
    .digest('hex')
    .slice(0, 8);
}

function entryHash(input: IslandBundleInput): string {
  return entryName(input).slice('island-'.length);
}

export function containsBundledReact(source: string): boolean {
  return (
    source.includes(
      '__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED',
    ) || source.includes('ReactCurrentDispatcher')
  );
}

function dedupeInputs(
  inputs: IslandBundleInput[],
): IslandBundleInput[] {
  const byKey = new Map<string, IslandBundleInput>();

  for (const input of inputs) {
    const key = islandKey(input.source, input.exportName);
    if (!byKey.has(key)) byKey.set(key, input);
  }

  return [...byKey.values()].sort((a, b) =>
    islandKey(a.source, a.exportName).localeCompare(
      islandKey(b.source, b.exportName),
    ),
  );
}

/**
 * 为岛屿生成入口并用 Bun.build 打包为浏览器 ESM。
 *
 * React 家族保持 external；产物带内容 hash，便于长期缓存。
 */
export async function buildIslandBundles(
  inputs: IslandBundleInput[],
  options: BuildIslandBundlesOptions,
): Promise<IslandBuildResult> {
  const unique = dedupeInputs(inputs);
  if (unique.length === 0) {
    return { bundles: [], assets: new Map() };
  }

  const workspaceRoot = realpathSync(options.workspaceRoot);
  const cacheDir = path.resolve(options.cacheDir);
  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });

  const bundles: IslandBundle[] = [];
  const assets = new Map<string, IslandAsset>();

  for (const input of unique) {
    const visited = new Set<string>();
    scanUnsafeImports(
      input.source,
      workspaceRoot,
      visited,
      input.exportName,
    );

    const entryPath = path.join(
      cacheDir,
      `${entryName(input)}.tsx`,
    );
    writeFileSync(entryPath, entrySource(input));

    let output: Awaited<ReturnType<typeof Bun.build>>;
    try {
      output = await Bun.build({
        entrypoints: [entryPath],
        outdir: cacheDir,
        target: 'browser',
        format: 'esm',
        minify: true,
        external: [
          'react',
          'react/*',
          'react-dom',
          'react-dom/*',
        ],
        define: {
          'process.env.NODE_ENV': '"production"',
        },
        naming: '[name].[ext]',
      });
    } catch (error) {
      throw buildError(input, error);
    }

    if (!output.success) {
      throw buildError(input, undefined, output.logs);
    }

    const jsOutput = output.outputs.find(
      (item) =>
        item.kind === 'entry-point' &&
        item.path.endsWith('.js'),
    );
    if (!jsOutput) {
      throw buildError(
        input,
        new Error('Bun.build 未产出 JS'),
      );
    }

    const jsText = await jsOutput.text();
    if (containsBundledReact(jsText)) {
      throw islandError(
        'DUPLICATE_REACT',
        `岛屿产物包含 React 副本：${input.source}`,
        input.source,
        input.exportName,
      );
    }

    const jsBytes = new TextEncoder().encode(jsText).length;
    let cssBytes = 0;
    const hash = entryHash(input);
    const jsFile = `island-${hash}-${contentHash(jsText)}.js`;
    const jsPath = path.join(cacheDir, jsFile);
    if (jsOutput.path !== jsPath) {
      renameSync(jsOutput.path, jsPath);
    }

    const cssOutput = output.outputs.find((item) =>
      item.path.endsWith('.css'),
    );
    let cssPath: string | undefined;
    let cssFile: string | undefined;

    if (cssOutput) {
      const cssText = await cssOutput.text();
      cssBytes = new TextEncoder().encode(cssText).length;
      cssFile = `island-${hash}-${contentHash(cssText)}.css`;
      cssPath = path.join(cacheDir, cssFile);
      if (cssOutput.path !== cssPath) {
        renameSync(cssOutput.path, cssPath);
      }
    }

    const key = islandKey(input.source, input.exportName);
    const js = assetUrl(
      options.basePath,
      `assets/islands/${jsFile}`,
    );
    const css = cssFile
      ? assetUrl(
          options.basePath,
          `assets/islands/${cssFile}`,
        )
      : undefined;
    const bundle: IslandBundle = {
      key,
      name: input.name,
      source: input.source,
      relativeSource: input.relativeSource,
      exportName: input.exportName,
      importedName: input.importedName,
      propertyPath: [...input.propertyPath],
      js,
      ...(css ? { css } : {}),
      jsPath,
      ...(cssPath ? { cssPath } : {}),
      bytes: jsBytes + cssBytes,
    };

    bundles.push(bundle);
    assets.set(key, {
      js,
      ...(css ? { css } : {}),
    });
  }

  return { bundles, assets };
}

export function islandInputFromReference(
  reference: IslandReference,
): IslandBundleInput {
  return {
    source: reference.import.filePath,
    relativeSource: reference.import.relativePath,
    exportName: islandExportName(reference),
    importedName: reference.import.importedName,
    propertyPath: [...reference.propertyPath],
    name: reference.name,
  };
}

export function collectIslandInputs(
  references: IslandReference[],
): IslandBundleInput[] {
  return dedupeInputs(
    references.map(islandInputFromReference),
  );
}

/**
 * 把缓存中的岛屿产物复制到 dist/assets/islands。
 */
export function copyIslandAssets(
  outDir: string,
  result: IslandBuildResult,
): void {
  if (result.bundles.length === 0) return;

  const targetDir = path.join(
    outDir,
    'assets',
    'islands',
  );
  mkdirSync(targetDir, { recursive: true });

  for (const bundle of result.bundles) {
    copyFileSync(
      bundle.jsPath,
      path.join(targetDir, path.basename(bundle.jsPath)),
    );
    if (bundle.cssPath) {
      copyFileSync(
        bundle.cssPath,
        path.join(
          targetDir,
          path.basename(bundle.cssPath),
        ),
      );
    }
  }
}
