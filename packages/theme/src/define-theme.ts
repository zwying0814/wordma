import type { ComponentType } from 'react';

import type { PageContext } from './types/page-context';

export type ThemeLayout<Props = PageContext> = ComponentType<Props>;

export type ThemeLayouts = Record<string, ThemeLayout<any>>;

export type ThemeStyleGroups = {
  tokens?: string[];
  global?: string[];
  prose?: string[];
};

export type ThemeStyles = string[] | ThemeStyleGroups;

export type ThemeDefinition = {
  layouts: ThemeLayouts;
  styles?: ThemeStyles;
};

export function defineTheme(definition: ThemeDefinition): ThemeDefinition {
  return definition;
}
