import type { ContentDiagnostic } from '../diagnostics';
import type { AssetRef, TaxonomyTerm } from './common';

export type PageKind = 'post' | 'page';

export type PageFrontmatter = {
  title: string;
  slug?: string;
  date?: string;
  updated?: string;
  description?: string;
  tags: string[];
  categories: string[];
  draft: boolean;
  cover?: string;
  /** 主题 pageTypes 的 id，例如 about / project */
  type?: string;
  /** 主题扩展字段：theme.<packageName>.<field> */
  theme?: Record<string, Record<string, unknown>>;
};

export type PageMeta = {
  id: string;
  kind: PageKind;
  /** 主题 pageTypes 的 id，例如 about / project */
  type?: string;
  title: string;
  slug: string;
  date?: string;
  updated?: string;
  description?: string;
  tags: string[];
  categories: string[];
  draft: boolean;
  cover?: string;
  /**
   * 原始扩展数据，包含 theme 命名空间。
   * 主题字段请通过 readThemeFields() 读取。
   */
  data: Record<string, unknown>;
};

export type EntrySummary = {
  id: string;
  slug: string;
  title: string;
  date?: string;
  description?: string;
  tags: string[];
  categories: string[];
  draft: boolean;
  cover?: string;
  url?: string;
};

export type PostSummary = EntrySummary;

export type PageSummary = EntrySummary;

export type ContentCollectionKind = 'post' | 'page' | 'custom';

export type ContentEntry = {
  /** 稳定 id：collection/relativePathWithoutExt */
  id: string;
  collection: string;
  meta: PageMeta;
  frontmatter: PageFrontmatter;
  /** 绝对路径 */
  filePath: string;
  /** 相对 workspace 的路径，统一使用 / */
  relativePath: string;
  /** 去掉 frontmatter 的 MDX/Markdown 正文 */
  body: string;
  /** 正文第一行在源文件中的 1 基行号 */
  bodyLine: number;
  isFolderEntry: boolean;
  assets: AssetRef[];
  /** 用于排序的 UTC 毫秒；无日期时为 undefined */
  dateMs?: number;
};

export type ContentCollection = {
  name: string;
  kind: ContentCollectionKind;
  entries: ContentEntry[];
};

export type ContentIndex = {
  collections: Record<string, ContentCollection>;
  entries: ContentEntry[];
  tags: TaxonomyTerm[];
  categories: TaxonomyTerm[];
  diagnostics: ContentDiagnostic[];
};
