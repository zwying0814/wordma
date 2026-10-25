export type PageKind = 'post' | 'page';

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
