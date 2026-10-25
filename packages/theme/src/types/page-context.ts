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
  cover?: AssetRef;
  excerpt?: string;
};

export type PageCollections = {
  posts: PostSummary[];
  pages: PageSummary[];
};

export type ThemeHelpers = {
  url: (path: string) => string;
  asset: (path: string) => string;
  t: (key: string) => string;
};

export type PaginationInfo = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  prevUrl?: string;
  nextUrl?: string;
};

export type TaxonomyView =
  | {
      kind: 'categories' | 'tags';
    }
  | {
      kind: 'category' | 'tag';
      term: TaxonomyTerm;
      posts: PostSummary[];
    };

export type ArchiveGroup = {
  year: string;
  posts: PostSummary[];
};

export type PageTaxonomy = {
  tags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
  view?: TaxonomyView;
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
  pagination?: PaginationInfo;
  archive?: ArchiveGroup[];
};

export type ThemeLayoutKey =
  | 'root'
  | 'index'
  | 'post'
  | 'page'
  | 'archive'
  | 'taxonomy'
  | 'notFound';
