import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

import {
  loadContentIndex,
  type LoadContentIndexOptions,
} from './collections';
import { ContentError } from './diagnostics';
import type { ContentDiagnostic } from './diagnostics';
import { parseSiteConfig } from './schema/site';
import type { ContentIndex } from './types/content';
import type { SiteConfig } from './types/site';
import { parseYamlFile } from './yaml/parse';

export type LoadWorkspaceOptions = Pick<
  LoadContentIndexOptions,
  'includeDrafts'
>;

export type Workspace = {
  root: string;
  site: SiteConfig;
  contentDir: string;
  packageJson?: Record<string, unknown>;
  index: ContentIndex;
  diagnostics: ContentDiagnostic[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadWorkspace(
  rootInput: string,
  options: LoadWorkspaceOptions = {},
): Workspace {
  const root = path.resolve(rootInput);

  let rootStat;
  try {
    rootStat = statSync(root);
  } catch {
    throw new ContentError(
      'INVALID_WORKSPACE',
      `工作区不存在：${root}`,
      { path: root },
    );
  }

  if (!rootStat.isDirectory()) {
    throw new ContentError(
      'INVALID_WORKSPACE',
      `工作区不是目录：${root}`,
      { path: root },
    );
  }

  const rootReal = realpathSync(root);
  const sitePath = path.join(root, 'wordma.site.yaml');

  if (!existsSync(sitePath)) {
    throw new ContentError(
      'MISSING_SITE_CONFIG',
      `缺少站点配置：${sitePath}`,
      { file: sitePath },
    );
  }

  const site = parseSiteConfig(parseYamlFile(sitePath));
  const contentDir = path.join(root, 'content');

  let contentStat;
  try {
    contentStat = statSync(contentDir);
  } catch {
    throw new ContentError(
      'MISSING_CONTENT_DIR',
      `缺少 content 目录：${contentDir}`,
      { path: contentDir },
    );
  }

  if (!contentStat.isDirectory()) {
    throw new ContentError(
      'INVALID_CONTENT_DIR',
      `content 不是目录：${contentDir}`,
      { path: contentDir },
    );
  }

  const contentReal = realpathSync(contentDir);
  const relativeContent = path.relative(rootReal, contentReal);
  if (
    relativeContent === '' ||
    relativeContent.startsWith('..') ||
    path.isAbsolute(relativeContent)
  ) {
    throw new ContentError(
      'UNSAFE_PATH',
      `content 目录必须位于工作区内部：${contentDir}`,
      { path: contentDir },
    );
  }

  const diagnostics: ContentDiagnostic[] = [];
  const packageJsonPath = path.join(root, 'package.json');
  let packageJson: Record<string, unknown> | undefined;

  if (existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(
        readFileSync(packageJsonPath, 'utf8'),
      ) as Record<string, unknown>;
    } catch (error) {
      diagnostics.push({
        code: 'INVALID_PACKAGE_JSON',
        severity: 'warning',
        file: packageJsonPath,
        message: `package.json 解析失败：${errorMessage(error)}`,
      });
    }
  }

  const index = loadContentIndex(contentDir, {
    ...options,
    workspaceRoot: root,
  });
  diagnostics.push(...index.diagnostics);

  return {
    root,
    site,
    contentDir,
    packageJson,
    index,
    diagnostics,
  };
}
