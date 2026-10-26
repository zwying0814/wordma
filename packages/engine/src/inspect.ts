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
} from './diagnostics';
import type { Diagnostic } from './diagnostics';
import { inspectThemeManifest } from './theme/manifest';

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
    ],
  };
}
