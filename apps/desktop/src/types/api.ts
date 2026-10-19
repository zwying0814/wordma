/** 与主进程 IPC 契约对齐的共享类型（camelCase，源自 Rust serde 结构） */

export type Site = {
  id: number;
  name: string;
  description: string | null;
  /** 站点数据根目录（wordma.db / media / themes 都在这里） */
  dir: string;
  createdAt: string;
};

export type ArticleRef = { id: number; name: string };

/** 站点 components/ 下的一个 tsx 组件 */
export type ComponentMeta = {
  name: string;
  bytes: number;
  updatedAt: string;
};

export type Article = {
  id: number;
  siteId: number;
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  categories: ArticleRef[];
  tags: ArticleRef[];
  createdAt: string;
  updatedAt: string;
};

export type Tag = {
  id: number;
  siteId: number;
  name: string;
  createdAt: string;
  articleCount: number;
};

export type Category = Tag;

export type SitePage = {
  id: number;
  siteId: number;
  title: string;
  slug: string;
  content: string;
  showInNav: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MediaItem = {
  id: number;
  siteId: number;
  filename: string;
  originalName: string;
  mimeType: string;
  kind: 'image' | 'video';
  size: number;
  path: string;
  createdAt: string;
};

export type RoutingRules = {
  index: string;
  indexPagination: string;
  post: string;
  page: string;
  category: string;
  tag: string;
  archive: string;
  feed: string;
};

export type RouteCheck = {
  route: string;
  ok: boolean;
  message?: string;
  example?: string;
};

declare global {
  interface Window {
    api: {
      invoke: (channel: string, payload?: unknown) => Promise<unknown>;
      /** File 对象 → 磁盘真实路径（媒体上传） */
      getPathForFile: (file: File) => string;
    };
  }
}
