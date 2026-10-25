import type { NavigationItem, SiteMeta } from './common';

export type ThemeSelection = {
  id: string;
  settings: Record<string, unknown>;
};

export type SiteConfig = {
  site: SiteMeta;
  theme: ThemeSelection;
  navigation: NavigationItem[];
};
