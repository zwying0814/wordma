import { createContext, useContext } from "react";
import type { Article } from "../lib/article";
import type { SitePage } from "../lib/pages";
import type { Category, Tag } from "../lib/taxonomy";
import type { MediaItem } from "../lib/media";
import type { Site } from "../lib/site";

export interface SiteContextValue {
  activeSite: Site;
  /** 当前站点文章列表，切换站点 / 增删改后由 HomePage 刷新 */
  articles: Article[];
  articlesLoading: boolean;
  reloadArticles: () => void;
  /** 当前站点的标签与分类（列表页与编辑器共用） */
  tags: Tag[];
  categories: Category[];
  taxonomyLoading: boolean;
  reloadTaxonomy: () => void;
  /** 当前站点的独立页面 */
  pages: SitePage[];
  pagesLoading: boolean;
  reloadPages: () => void;
  media: MediaItem[];
  reloadMedia: () => void;
}

export const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite(): SiteContextValue {
  const value = useContext(SiteContext);
  if (!value) {
    throw new Error("useSite 必须在 SiteContext.Provider 内使用");
  }
  return value;
}
