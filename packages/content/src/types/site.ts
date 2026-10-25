import type { NavigationItem, SiteMeta } from './common';

export type ThemeSelection = {
  id: string;
  settings: Record<string, unknown>;
};

export type SiteRoutes = {
  post: string;
  page: string;
  collection: string;
  archive: string;
  categories: string;
  category: string;
  tags: string;
  tag: string;
  pagination: string;
};

export type PaginationConfig = {
  pageSize: number;
};

export const DEFAULT_ROUTES: SiteRoutes = {
  post: '/posts/[slug]/',
  page: '/[slug]/',
  collection: '/[collection]/[slug]/',
  archive: '/archive/',
  categories: '/categories/',
  category: '/category/[slug]/',
  tags: '/tags/',
  tag: '/tag/[slug]/',
  pagination: '/page/[page]/',
};

export const DEFAULT_PAGINATION: PaginationConfig = {
  pageSize: 10,
};

export type SiteConfig = {
  site: SiteMeta;
  theme: ThemeSelection;
  navigation: NavigationItem[];
  routes: SiteRoutes;
  pagination: PaginationConfig;
};
