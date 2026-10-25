export type Heading = {
  id: string;
  text: string;
  depth: 1 | 2 | 3 | 4 | 5 | 6;
};

export type AssetRef = {
  source: string;
  url: string;
  hash?: string;
  bytes?: number;
};

export type IslandRef = {
  name: string;
  source: string;
  exportName?: string;
  props?: Record<string, unknown>;
  js?: string;
  css?: string;
};

export type TaxonomyTerm = {
  name: string;
  slug: string;
  count: number;
  url?: string;
};

export type NavigationItem = {
  label: string;
  path: string;
};

export type SiteMeta = {
  title: string;
  description?: string;
  url?: string;
  language: string;
  basePath: string;
};
