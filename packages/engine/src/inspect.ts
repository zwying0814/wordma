import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  parseSiteConfig,
  parseThemeManifest,
  parseYamlFile,
} from '@wordma/content';
import type {
  FieldDescriptor,
  PageTypeDeclaration,
  ThemeManifest,
  ThemePageDeclaration,
  ThemeSettingDescriptor,
} from '@wordma/content';

export type InspectTheme = {
  id: string;
  displayName: string;
  version: string;
  path: string;
};

export type InspectPageType = PageTypeDeclaration & {
  id: string;
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
};

type ResolvedTheme = {
  manifest: ThemeManifest;
  path: string;
};

function resolveThemeManifest(
  root: string,
  themeId: string,
): ResolvedTheme | null {
  const candidates = [
    path.join(root, 'themes', themeId, 'theme.yaml'),
    path.join(root, 'node_modules', themeId, 'theme.yaml'),
  ];

  if (themeId === 'wordma-theme-default') {
    // 开发仓库里的内置主题；发布后由引擎依赖提供。
    candidates.push(
      path.resolve(import.meta.dirname, '../../../themes/default/theme.yaml'),
    );
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;

    return {
      manifest: parseThemeManifest(parseYamlFile(candidate)),
      path: candidate,
    };
  }

  return null;
}

export function inspectWorkspace(rootInput: string): InspectResult {
  const root = path.resolve(rootInput);
  const siteFile = path.join(root, 'wordma.site.yaml');

  if (!existsSync(siteFile)) {
    throw new Error(`未找到站点配置：${siteFile}`);
  }

  const site = parseSiteConfig(parseYamlFile(siteFile));
  const resolvedTheme = resolveThemeManifest(root, site.theme.id);
  const manifest = resolvedTheme?.manifest;

  return {
    workspace: root,
    themeId: site.theme.id,
    site: {
      title: site.site.title,
      language: site.site.language,
      basePath: site.site.basePath,
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
  };
}
