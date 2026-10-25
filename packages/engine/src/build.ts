import path from 'node:path';

import { loadWorkspace } from '@wordma/content';
import type {
  ContentDiagnostic,
  ContentEntry,
} from '@wordma/content';
import type { PageAssets } from '@wordma/theme';

import {
  prepareOutDir,
  resolveOutDir,
  writeBuildManifest,
  writeHtmlFile,
} from './output/writer';
import type { BuildManifest } from './output/writer';
import { analyzeMdx, compileMdx } from './mdx/compile';
import type {
  CompiledContent,
  MdxAnalysis,
} from './mdx/compile';
import {
  buildIslandBundles,
  collectIslandInputs,
  copyIslandAssets,
} from './islands/bundle';
import {
  buildIslandRuntime,
  copyIslandRuntime,
} from './islands/runtime';
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
  islands: number;
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
  const analyses = new Map<
    string,
    { entry: ContentEntry; analysis: MdxAnalysis }
  >();

  for (const route of routeManifest.routes) {
    if (!route.entryId || analyses.has(route.entryId)) {
      continue;
    }

    const entry = entriesById.get(route.entryId);
    if (!entry) continue;

    analyses.set(route.entryId, {
      entry,
      analysis: analyzeMdx(entry.body, {
        filePath: entry.filePath,
        workspaceRoot: root,
      }),
    });
  }

  const islandBundles = await buildIslandBundles(
    collectIslandInputs(
      [...analyses.values()].flatMap(
        (item) => item.analysis.references,
      ),
    ),
    {
      workspaceRoot: root,
      cacheDir: path.join(root, '.wordma/cache/islands'),
      basePath: workspace.site.site.basePath,
    },
  );
  const islandRuntime =
    islandBundles.bundles.length > 0
      ? await buildIslandRuntime({
          cacheDir: path.join(
            root,
            '.wordma/cache/islands',
          ),
          basePath: workspace.site.site.basePath,
        })
      : undefined;

  prepareOutDir(outDir);
  copyIslandAssets(outDir, islandBundles);
  if (islandRuntime) {
    copyIslandRuntime(outDir, islandRuntime);
  }

  const compiledContent = new Map<string, CompiledContent>();

  for (const [entryId, item] of analyses) {
    compiledContent.set(
      entryId,
      await compileMdx(item.entry.body, {
        filePath: item.entry.filePath,
        workspaceRoot: root,
        analysis: item.analysis,
        islandAssets: islandBundles.assets,
      }),
    );
  }

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
    const assets: PageAssets =
      islandRuntime && context.content.islands.length > 0
        ? {
            styles: [
              ...new Set(
                context.content.islands
                  .map((island) => island.css)
                  .filter(
                    (css): css is string =>
                      typeof css === 'string',
                  ),
              ),
            ],
            importMap: islandRuntime.importMap,
            bodyScripts: [islandRuntime.mount.url],
          }
        : { styles: [], bodyScripts: [] };
    const html = renderRoute({
      route,
      context,
      themeRuntime,
      assets,
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
    assets: {
      islands: islandBundles.bundles.map((bundle) => ({
        source: bundle.relativeSource,
        exportName: bundle.exportName,
        js: bundle.js,
        ...(bundle.css ? { css: bundle.css } : {}),
        bytes: bundle.bytes,
      })),
      ...(islandRuntime
        ? {
            reactRuntime: {
              url: islandRuntime.react.url,
              bytes: islandRuntime.react.bytes,
            },
            mountScript: {
              url: islandRuntime.mount.url,
              bytes: islandRuntime.mount.bytes,
            },
          }
        : {}),
    },
  };

  writeBuildManifest(outDir, buildManifest);

  return {
    outDir,
    routes: routeManifest.routes.length,
    compiledEntries: compiledContent.size,
    islands: islandBundles.bundles.length,
    theme: {
      id: themeRuntime.manifest.id,
      version: themeRuntime.manifest.version,
    },
    diagnostics,
    manifest: routeManifest,
  };
}
