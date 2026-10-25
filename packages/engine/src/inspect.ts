import path from 'node:path';

import {
  loadWorkspace,
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';
import type {
  ContentCollectionKind,
  ContentDiagnostic,
  FieldDescriptor,
  PageTypeDeclaration,
  TaxonomyTerm,
  ThemeManifest,
  ThemePageDeclaration,
  ThemeSettingDescriptor,
} from '@wordma/content';

import { resolveThemeDirectory } from './theme/resolve';

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
  collections: InspectCollection[];
  tags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
  diagnostics: ContentDiagnostic[];
};

type ResolvedTheme = {
  manifest: ThemeManifest;
  path: string;
};

function resolveThemeManifest(
  root: string,
  themeId: string,
): ResolvedTheme | null {
  const directory = resolveThemeDirectory(root, themeId);
  if (!directory) return null;

  const manifestPath = path.join(directory, 'theme.yaml');
  return {
    manifest: parseThemeManifest(parseYamlFile(manifestPath)),
    path: manifestPath,
  };
}

export function inspectWorkspace(rootInput: string): InspectResult {
  const workspace = loadWorkspace(rootInput);
  const root = workspace.root;
  const themeId = workspace.site.theme.id;
  const resolvedTheme = resolveThemeManifest(root, themeId);
  const manifest = resolvedTheme?.manifest;

  return {
    workspace: root,
    themeId,
    site: {
      title: workspace.site.site.title,
      language: workspace.site.site.language,
      basePath: workspace.site.site.basePath,
    },
    theme:
      resolvedTheme && manifest
        ? {
            id: manifest.id,
            displayName: manifest.displayName,
            version: manifest.version,
            path: path.relative(root, resolvedTheme.path) || '.',
          }
        : null,
    postFields: manifest?.content?.post.fields ?? [],
    pageFields: manifest?.content?.page.fields ?? [],
    pageTypes: Object.entries(
      manifest?.content?.pageTypes ?? {},
    ).map(([id, declaration]) => ({ id, ...declaration })),
    pages: manifest?.pages ?? [],
    settings: manifest?.settings ?? [],
    collections: Object.values(workspace.index.collections).map(
      (collection) => ({
        name: collection.name,
        kind: collection.kind,
        count: collection.entries.length,
      }),
    ),
    tags: workspace.index.tags,
    categories: workspace.index.categories,
    diagnostics: workspace.diagnostics,
  };
}
