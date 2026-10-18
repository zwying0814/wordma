export type ThemeSettingType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'select'
  | 'color';

export type ThemeSettingSchema = {
  key: string;
  label: string;
  type: ThemeSettingType;
  default?: string | number | boolean;
  options?: string[];
};

export type ThemeMeta = {
  name: string;
  displayName: string;
  version: string;
  author: string;
  description: string;
  layout: string;
  tags: string[];
  preview: Record<string, string>;
  settings: ThemeSettingSchema[];
  active: boolean;
  invalidMessage?: string;
};

export type ThemeSettings = {
  themeName: string;
  schema: ThemeSettingSchema[];
  values: Record<string, string | number | boolean>;
};

export function listThemes(siteId: number): Promise<ThemeMeta[]> {
  return window.api.invoke('list_themes', { siteId }) as Promise<ThemeMeta[]>;
}

export function setActiveTheme(payload: {
  siteId: number;
  name: string;
}): Promise<void> {
  return window.api.invoke('set_active_theme', payload) as Promise<void>;
}

export function deleteTheme(name: string): Promise<void> {
  return window.api.invoke('delete_theme', { name }) as Promise<void>;
}

export function getThemeSettings(payload: {
  siteId: number;
  themeName?: string;
}): Promise<ThemeSettings> {
  return window.api.invoke('get_theme_settings', payload) as Promise<ThemeSettings>;
}

export function setThemeSettings(payload: {
  siteId: number;
  themeName: string;
  values: Record<string, unknown>;
}): Promise<Record<string, string | number | boolean>> {
  return window.api.invoke('set_theme_settings', payload) as Promise<
    Record<string, string | number | boolean>
  >;
}
