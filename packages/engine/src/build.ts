import path from 'node:path';

import { loadWorkspace } from '@wordma/content';
import type { ContentDiagnostic } from '@wordma/content';

import {
  prepareOutDir,
  resolveOutDir,
  writeBuildManifest,
  writeHtmlFile,
} from './output/writer';
import type { BuildManifest } from './output/writer';
import { compileMdx } from './mdx/compile';
import type { CompiledContent } from './mdx/compile';
import { createPageContext } from './render/page-context';
import { renderRoute } from './render/ssr';
import {
  buildRouteManifest,
} from './routing/manifest';
import type { RouteManifest } from './routing/manifest';
import { loadThemeRuntime } from './theme/runtime';

export type BuildOptions = {
  root: string;
  outDir?: string;
  includeDrafts?: boolean;
};

export type BuildResult = {
  outDir: string;
  routes: number;
  compiledEntries: number;
  theme: {
    id: string;
    version: string;
  };
  diagnostics: ContentDiagnostic[];
  manifest: RouteManifest;
};

export async function buildSite(
  options: BuildOptions,
): Promise<BuildResult> {
  const root = path.resolve(options.root);
  const workspace = loadWorkspace(root, {
    includeDrafts: options.includeDrafts,
  });
  const themeRuntime = await loadThemeRuntime(
    root,
    workspace.site.theme.id,
  );
  const routeManifest = buildRouteManifest(
    workspace,
    themeRuntime.manifest,
  );
  const outDir = resolveOutDir(root, options.outDir);
  const entriesById = new Map(
    workspace.index.entries.map((entry) => [entry.id, entry]),
  );
  const compiledContent = new Map<string, CompiledContent>();

  for (const route of routeManifest.routes) {
    if (!route.entryId || compiledContent.has(route.entryId)) {
      continue;
    }

    const entry = entriesById.get(route.entryId);
    if (!entry) continue;

    compiledContent.set(
      route.entryId,
      await compileMdx(entry.body, {
        filePath: entry.filePath,
        workspaceRoot: root,
      }),
    );
  }

  prepareOutDir(outDir);

  for (const route of routeManifest.routes) {
    const context = createPageContext({
      route,
      workspace,
      routeManifest,
      themeManifest: themeRuntime.manifest,
      compiledContent: route.entryId
        ? compiledContent.get(route.entryId)
        : undefined,
    });
    const html = renderRoute({
      route,
      context,
      themeRuntime,
    });

    writeHtmlFile(outDir, route, html);
  }

  const diagnostics = [
    ...routeManifest.diagnostics,
    ...themeRuntime.diagnostics,
  ];
  const buildManifest: BuildManifest = {
    version: 1,
    site: {
      title: workspace.site.site.title,
      basePath: workspace.site.site.basePath,
    },
    theme: {
      id: themeRuntime.manifest.id,
      version: themeRuntime.manifest.version,
    },
    routes: routeManifest.routes,
    diagnostics,
  };

  writeBuildManifest(outDir, buildManifest);

  return {
    outDir,
    routes: routeManifest.routes.length,
    compiledEntries: compiledContent.size,
    theme: {
      id: themeRuntime.manifest.id,
      version: themeRuntime.manifest.version,
    },
    diagnostics,
    manifest: routeManifest,
  };
}
