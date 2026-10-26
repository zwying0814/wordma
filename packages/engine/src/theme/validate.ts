import type {
  ThemeManifest,
  Workspace,
} from '@wordma/content';

import type { Diagnostic } from '../diagnostics';
import { ThemeError } from '../errors';
import type { RouteManifest } from '../routing/manifest';
import type { ThemeRuntime } from './runtime';

export type ThemeValidationResult = {
  diagnostics: Diagnostic[];
};

function pageTypePlaceholders(route: string): string[] {
  return [...route.matchAll(/\[([^\]]*)\]/g)].map(
    (match) => match[1] ?? '',
  );
}

export function validateThemeContent(
  workspace: Workspace,
  manifest: ThemeManifest,
): ThemeValidationResult {
  const diagnostics: Diagnostic[] = [];
  const pageTypes = manifest.content?.pageTypes ?? {};

  for (const [pageTypeId, declaration] of Object.entries(
    pageTypes,
  )) {
    const invalid = pageTypePlaceholders(
      declaration.route,
    ).filter((name) => name !== 'slug');

    if (invalid.length > 0) {
      diagnostics.push({
        code: 'INVALID_PAGE_TYPE_ROUTE',
        severity: 'error',
        source: 'theme',
        message: `pageType ${pageTypeId} 只允许 [slug] 占位符，发现：${invalid
          .map((name) => `[${name}]`)
          .join(', ')}`,
        field: pageTypeId,
        path: declaration.route,
      });
    }

    if (
      declaration.collection &&
      !workspace.index.collections[declaration.collection]
    ) {
      diagnostics.push({
        code: 'MISSING_COLLECTION',
        severity: 'warning',
        source: 'theme',
        message: `pageType ${pageTypeId} 引用的 collection 不存在：${declaration.collection}`,
        field: pageTypeId,
        path: declaration.collection,
      });
    }
  }

  for (const entry of workspace.index.entries) {
    if (!entry.meta.type) continue;
    if (pageTypes[entry.meta.type]) continue;

    diagnostics.push({
      code: 'UNKNOWN_PAGE_TYPE',
      severity: 'warning',
      source: 'theme',
      message: `entry 使用了未声明的 pageType：${entry.meta.type}`,
      file: entry.filePath,
      field: 'type',
    });
  }

  return { diagnostics };
}

export function assertValidThemeContent(
  result: ThemeValidationResult,
  options: {
    themeId: string;
    path?: string;
  },
): void {
  const error = result.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );

  if (!error) return;

  throw new ThemeError(error.code, error.message, {
    themeId: options.themeId,
    path: options.path ?? error.path,
  });
}

export function assertRouteLayouts(
  routeManifest: RouteManifest,
  themeRuntime: ThemeRuntime,
): void {
  for (const route of routeManifest.routes) {
    const layout =
      themeRuntime.definition.layouts[route.layout];

    if (typeof layout === 'function') continue;

    throw new ThemeError(
      'MISSING_LAYOUT',
      `主题缺少布局：${route.layout}（路由 ${route.path}）`,
      {
        themeId: themeRuntime.manifest.id,
        path: route.path,
      },
    );
  }
}
