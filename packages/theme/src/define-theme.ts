import type { ComponentType } from 'react';

/**
 * M0.1 占位类型。
 *
 * 真实的 PageContext / layout props 会在 M0.2 定义，这里先用宽松的
 * component 类型保证主题包可以独立 typecheck。
 */
export type ThemeLayout = ComponentType<any>;

export type ThemeLayouts = Record<string, ThemeLayout>;

export type ThemeDefinition = {
  layouts: ThemeLayouts;
  styles?: string[];
};

export function defineTheme(definition: ThemeDefinition): ThemeDefinition {
  return definition;
}
