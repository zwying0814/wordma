import type {
  AssetRef,
  Heading,
  IslandRef,
  NavigationItem,
  PageMeta,
  PageSummary,
  PostSummary,
  SiteMeta,
  TaxonomyTerm,
} from '@wordma/content';

export type PageContent = {
  html: string;
  headings: Heading[];
  islands: IslandRef[];
  assets: AssetRef[];
  excerpt?: string;
};

export type PageCollections = {
  posts: PostSummary[];
  pages: PageSummary[];
};

export type PageTaxonomy = {
  tags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
};

export type ThemeHelpers = {
  url: (path: string) => string;
  asset: (path: string) => string;
  t: (key: string) => string;
};

export type PageContext<
  TTheme = Record<string, unknown>,
> = {
  site: SiteMeta;
  page: PageMeta;
  content: PageContent;
  collections: PageCollections;
  taxonomy: PageTaxonomy;
  navigation: NavigationItem[];
  theme: TTheme;
  helpers: ThemeHelpers;
};

export type ThemeLayoutKey =
  | 'root'
  | 'index'
  | 'post'
  | 'page'
  | 'archive'
  | 'taxonomy'
  | 'notFound';
