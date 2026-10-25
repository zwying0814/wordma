import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PageContext, ThemeLayout } from '@wordma/theme';
import {
  PageAssetsProvider,
} from '@wordma/theme';
import type { PageAssets } from '@wordma/theme';

import { ThemeError } from '../errors';
import type { Route } from '../routing/manifest';
import type { ThemeRuntime } from '../theme/runtime';

export type RenderRouteOptions = {
  route: Route;
  context: PageContext;
  themeRuntime: ThemeRuntime;
  assets?: PageAssets;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getLayout(
  runtime: ThemeRuntime,
  key: string,
): ThemeLayout {
  const layout = runtime.definition.layouts[key];

  if (typeof layout !== 'function') {
    throw new ThemeError(
      'MISSING_LAYOUT',
      `主题缺少布局：${key}`,
      {
        themeId: runtime.manifest.id,
        path: runtime.directory,
      },
    );
  }

  return layout;
}

export function renderRoute(options: RenderRouteOptions): string {
  const { route, context, themeRuntime } = options;
  const assets = options.assets ?? {
    styles: [],
    bodyScripts: [],
  };

  const pageLayout = getLayout(themeRuntime, route.layout);
  const rootLayout = getLayout(themeRuntime, 'root');

  try {
    const page = createElement(pageLayout, context);
    const RootLayout = rootLayout as ComponentType<
      PageContext & { children: ReactNode }
    >;
    const root = createElement(RootLayout, {
      ...context,
      children: page,
    });
    const tree = createElement(
      PageAssetsProvider,
      { assets },
      root,
    );

    return `<!DOCTYPE html>\n${renderToStaticMarkup(tree)}`;
  } catch (error) {
    if (error instanceof ThemeError) throw error;

    throw new ThemeError(
      'RENDER_FAILED',
      `渲染失败：${errorMessage(error)}`,
      {
        themeId: themeRuntime.manifest.id,
        path: route.path,
      },
    );
  }
}
