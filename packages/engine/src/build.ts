import path from 'node:path';

import { loadWorkspace } from '@wordma/content';
import type {
  AssetRef,
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
import type {
  BuildManifestOutput,
  BuildManifestPage,
} from './output/writer';
import {
  copyContentAssets,
  createContentAssetResolver,
  resolveContentAssetPath,
} from './output/content-assets';
import { copyStaticAssets } from './output/static';
import { writeFeeds } from './output/feeds';
import { createBuildCache } from './cache/build-cache';
import type { CacheStats } from './cache/build-cache';
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
import { referenceIslandKey } from './islands/identity';
import {
  buildIslandRuntime,
  copyIslandRuntime,
} from './islands/runtime';
import { createPageContext } from './render/page-context';
import { renderRoute } from './render/ssr';
import {
  buildThemeStyles,
  copyThemeStyles,
} from './styles/theme-styles';
import {
  buildRouteManifest,
} from './routing/manifest';
import type { RouteManifest } from './routing/manifest';
import { loadThemeRuntime } from './theme/runtime';

export type BuildOptions = {
  root: string;
  outDir?: string;
  includeDrafts?: boolean;
  cache?: boolean;
};

export type BuildResult = {
  outDir: string;
  routes: number;
  compiledEntries: number;
  islands: number;
  cache: CacheStats;
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
  const cache = createBuildCache({
    workspaceRoot: root,
    enabled: options.cache !== false,
  });
  const themeStyles = buildThemeStyles({
    themeRuntime,
    cacheDir: cache.workDir('css'),
    basePath: workspace.site.site.basePath,
    cache,
  });
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
        lineOffset: entry.bodyLine - 1,
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
      cacheDir: cache.workDir('islands'),
      basePath: workspace.site.site.basePath,
      cache,
    },
  );
  const islandRuntime =
    islandBundles.bundles.length > 0
      ? await buildIslandRuntime({
          cacheDir: cache.workDir('runtime'),
          basePath: workspace.site.site.basePath,
          cache,
        })
      : undefined;

  prepareOutDir(outDir);
  const staticAssets = copyStaticAssets({
    root,
    themeDirectory: themeRuntime.directory,
    outDir,
    basePath: workspace.site.site.basePath,
  });
  const contentAssets = copyContentAssets({
    workspaceRoot: root,
    outDir,
    basePath: workspace.site.site.basePath,
    entries: [...analyses.values()].map(
      (item) => item.entry,
    ),
  });
  copyThemeStyles(outDir, themeStyles);
  copyIslandAssets(outDir, islandBundles);
  if (islandRuntime) {
    copyIslandRuntime(outDir, islandRuntime);
  }

  const compiledContent = new Map<string, CompiledContent>();
  const entryAssets = new Map<string, AssetRef[]>();
  const entryCovers = new Map<string, AssetRef>();

  for (const [entryId, item] of analyses) {
    entryAssets.set(
      entryId,
      item.entry.assets
        .map((asset) =>
          contentAssets.bySource.get(asset.source),
        )
        .filter(
          (asset): asset is AssetRef =>
            asset !== undefined,
        ),
    );

    if (item.entry.meta.cover) {
      const realPath = resolveContentAssetPath(
        item.entry.meta.cover,
        item.entry.filePath,
        root,
      );
      const cover = realPath
        ? contentAssets.byRealPath.get(realPath)
        : undefined;

      if (cover) entryCovers.set(entryId, cover);
    }

    const islandCacheKey = item.analysis.references.map(
      (reference) => {
        const key = referenceIslandKey(reference);
        const asset = islandBundles.assets.get(key);

        return {
          key,
          js: asset?.js ?? null,
          css: asset?.css ?? null,
        };
      },
    );
    const cacheKey = cache.hash({
      file: item.entry.relativePath,
      body: cache.hash(item.entry.body),
      basePath: workspace.site.site.basePath,
      islands: islandCacheKey,
      assets: (entryAssets.get(entryId) ?? []).map(
        (asset) => ({
          source: asset.source,
          url: asset.url,
          hash: asset.hash ?? null,
        }),
      ),
    });

    compiledContent.set(
      entryId,
      await compileMdx(item.entry.body, {
        filePath: item.entry.filePath,
        workspaceRoot: root,
        analysis: item.analysis,
        islandAssets: islandBundles.assets,
        resolveAsset: createContentAssetResolver({
          entryFilePath: item.entry.filePath,
          workspaceRoot: root,
          byRealPath: contentAssets.byRealPath,
        }),
        cache,
        cacheKey,
      }),
    );
  }

  const pages: BuildManifestPage[] = [];

  for (const route of routeManifest.routes) {
    const context = createPageContext({
      route,
      workspace,
      routeManifest,
      themeManifest: themeRuntime.manifest,
      compiledContent: route.entryId
        ? compiledContent.get(route.entryId)
        : undefined,
      contentAssets: route.entryId
        ? entryAssets.get(route.entryId)
        : undefined,
      contentCover: route.entryId
        ? entryCovers.get(route.entryId)
        : undefined,
    });
    const islandStyles =
      islandRuntime && context.content.islands.length > 0
        ? context.content.islands
            .map((island) => island.css)
            .filter(
              (css): css is string =>
                typeof css === 'string',
            )
        : [];
    const assets: PageAssets = {
      styles: [
        ...(themeStyles.css
          ? [themeStyles.css.url]
          : []),
        ...new Set(islandStyles),
      ],
      ...(islandRuntime && context.content.islands.length > 0
        ? {
            importMap: islandRuntime.importMap,
            bodyScripts: [islandRuntime.mount.url],
          }
        : { bodyScripts: [] }),
    };
    const html = renderRoute({
      route,
      context,
      themeRuntime,
      assets,
    });

    writeHtmlFile(outDir, route, html);
    pages.push({
      path: route.path,
      output: route.output,
      kind: route.kind,
      assets: {
        styles: [...assets.styles],
        scripts: [...assets.bodyScripts],
      },
    });
  }

  const feedResult = writeFeeds({
    site: workspace.site.site,
    routes: routeManifest.routes,
    posts:
      workspace.index.collections.posts?.entries ?? [],
    entriesById,
    excerpts: new Map(
      [...compiledContent.entries()]
        .filter(([, content]) => content.excerpt)
        .map(([id, content]) => [
          id,
          content.excerpt as string,
        ]),
    ),
    outDir,
    staticPaths: new Set(
      staticAssets.files.map((file) => file.path),
    ),
  });

  const diagnostics = [
    ...routeManifest.diagnostics,
    ...themeRuntime.diagnostics,
    ...staticAssets.diagnostics,
    ...contentAssets.diagnostics,
    ...feedResult.diagnostics,
  ];
  const outputs = new Map<string, BuildManifestOutput>();
  const addOutput = (
    outputPath: string,
    kind: BuildManifestOutput['kind'],
  ): void => {
    outputs.set(outputPath, { path: outputPath, kind });
  };

  for (const file of staticAssets.files) {
    addOutput(file.path, 'asset');
  }
  for (const file of contentAssets.files) {
    addOutput(file.path, 'asset');
  }
  if (themeStyles.css) {
    addOutput(themeStyles.css.path, 'asset');
  }
  for (const bundle of islandBundles.bundles) {
    addOutput(
      `assets/islands/${path.basename(bundle.jsPath)}`,
      'asset',
    );
    if (bundle.cssPath) {
      addOutput(
        `assets/islands/${path.basename(bundle.cssPath)}`,
        'asset',
      );
    }
  }
  if (islandRuntime) {
    addOutput(
      `assets/islands/${path.basename(islandRuntime.react.filePath)}`,
      'asset',
    );
    addOutput(
      `assets/islands/${path.basename(islandRuntime.mount.filePath)}`,
      'asset',
    );
  }
  for (const file of feedResult.files) {
    addOutput(file.path, 'feed');
  }
  for (const route of routeManifest.routes) {
    addOutput(route.output, 'html');
  }

  const buildManifest: BuildManifest = {
    version: 2,
    site: {
      title: workspace.site.site.title,
      basePath: workspace.site.site.basePath,
      ...(workspace.site.site.url
        ? { url: workspace.site.site.url }
        : {}),
    },
    theme: {
      id: themeRuntime.manifest.id,
      version: themeRuntime.manifest.version,
    },
    routes: routeManifest.routes,
    pages,
    diagnostics,
    assets: {
      ...(themeStyles.css
        ? {
            themeStyles: {
              url: themeStyles.css.url,
              bytes: themeStyles.css.bytes,
            },
          }
        : {}),
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
      content: contentAssets.files.map((file) => ({
        source: file.source,
        url: file.url,
        hash: file.hash,
        bytes: file.bytes,
      })),
      static: staticAssets.files.map((file) => ({
        path: file.path,
        url: file.url,
      })),
    },
    outputs: [...outputs.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
  };

  writeBuildManifest(outDir, buildManifest);

  return {
    outDir,
    routes: routeManifest.routes.length,
    compiledEntries: compiledContent.size,
    islands: islandBundles.bundles.length,
    cache: cache.stats,
    theme: {
      id: themeRuntime.manifest.id,
      version: themeRuntime.manifest.version,
    },
    diagnostics,
    manifest: routeManifest,
  };
}
