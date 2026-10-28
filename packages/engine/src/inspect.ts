import path from 'node:path';

import { loadWorkspace } from '@wordma/content';
import type {
  ContentCollectionKind,
  FieldDescriptor,
  PageTypeDeclaration,
  TaxonomyTerm,
  ThemeManifest,
  ThemePageDeclaration,
  ThemeSettingDescriptor,
} from '@wordma/content';

import {
  diagnosticFromContent,
  diagnosticsFromError,
} from './diagnostics';
import type { Diagnostic } from './diagnostics';
import { analyzeMdx } from './mdx/compile';
import { inspectThemeManifest } from './theme/manifest';
import { resolveThemeSettings } from './theme/settings';
import { validateThemeContent } from './theme/validate';

export type InspectTheme = {
  id: string;
  displayName: string;
  version: string;
  path: string;
};

export type InspectPageType = PageTypeDeclaration & {
  id: string;
};

export type InspectCollection = {
  name: string;
  kind: ContentCollectionKind;
  count: number;
};

export type InspectEntry = {
  id: string;
  collection: string;
  kind: 'post' | 'page';
  type?: string;
  title: string;
  slug: string;
  relativePath: string;
  date?: string;
  draft: boolean;
};

export type InspectResult = {
  workspace: string;
  themeId: string;
  site: {
    title: string;
    language: string;
    basePath: string;
  };
  theme: InspectTheme | null;
  postFields: FieldDescriptor[];
  pageFields: FieldDescriptor[];
  pageTypes: InspectPageType[];
  pages: ThemePageDeclaration[];
  settings: ThemeSettingDescriptor[];
  settingsDefaults: Record<string, unknown>;
  settingsValues: Record<string, unknown>;
  entries: InspectEntry[];
  collections: InspectCollection[];
  tags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
  diagnostics: Diagnostic[];
};

export function inspectWorkspace(rootInput: string): InspectResult {
  const workspace = loadWorkspace(rootInput);
  const root = workspace.root;
  const themeId = workspace.site.theme.id;
  const inspection = inspectThemeManifest(root, themeId);
  const manifest: ThemeManifest | undefined =
    inspection.manifest;
  const themePath =
    inspection.directory && manifest
      ? path.relative(
          root,
          path.join(inspection.directory, 'theme.yaml'),
        ) || '.'
      : undefined;
  const resolvedSettings = manifest
    ? resolveThemeSettings(
        manifest,
        workspace.site.theme.settings,
      )
    : {
        values: {},
        defaults: {},
        overrides: {},
        diagnostics: [],
      };
  const themeValidation = manifest
    ? validateThemeContent(workspace, manifest)
    : { diagnostics: [] };
  const mdxDiagnostics: Diagnostic[] = [];

  for (const entry of workspace.index.entries) {
    try {
      analyzeMdx(entry.body, {
        filePath: entry.filePath,
        workspaceRoot: root,
        lineOffset: entry.bodyLine - 1,
      });
    } catch (error) {
      mdxDiagnostics.push(...diagnosticsFromError(error));
    }
  }

  return {
    workspace: root,
    themeId,
    site: {
      title: workspace.site.site.title,
      language: workspace.site.site.language,
      basePath: workspace.site.site.basePath,
    },
    theme:
      manifest && themePath
        ? {
            id: manifest.id,
            displayName: manifest.displayName,
            version: manifest.version,
            path: themePath,
          }
        : null,
    postFields: manifest?.content?.post.fields ?? [],
    pageFields: manifest?.content?.page.fields ?? [],
    pageTypes: Object.entries(
      manifest?.content?.pageTypes ?? {},
    ).map(([id, declaration]) => ({ id, ...declaration })),
    pages: manifest?.pages ?? [],
    settings: manifest?.settings ?? [],
    settingsDefaults: resolvedSettings.defaults,
    settingsValues: resolvedSettings.values,
    entries: workspace.index.entries
      .map((entry) => ({
        id: entry.id,
        collection: entry.collection,
        kind: entry.meta.kind,
        ...(entry.meta.type ? { type: entry.meta.type } : {}),
        title: entry.meta.title,
        slug: entry.meta.slug,
        relativePath: entry.relativePath,
        ...(entry.meta.date ? { date: entry.meta.date } : {}),
        draft: entry.meta.draft,
      }))
      .sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath),
      ),
    collections: Object.values(workspace.index.collections).map(
      (collection) => ({
        name: collection.name,
        kind: collection.kind,
        count: collection.entries.length,
      }),
    ),
    tags: workspace.index.tags,
    categories: workspace.index.categories,
    diagnostics: [
      ...workspace.diagnostics.map((item) =>
        diagnosticFromContent(item, 'content'),
      ),
      ...inspection.diagnostics,
      ...resolvedSettings.diagnostics,
      ...themeValidation.diagnostics,
      ...mdxDiagnostics,
    ],
  };
}
