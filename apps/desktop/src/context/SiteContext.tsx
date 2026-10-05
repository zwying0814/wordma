import { createContext, useContext } from "react";
import type { Article } from "../lib/article";
import type { Site } from "../lib/site";

export interface SiteContextValue {
  activeSite: Site;
  /** 当前站点文章列表，切换站点 / 增删改后由 HomePage 刷新 */
  articles: Article[];
  articlesLoading: boolean;
  reloadArticles: () => void;
}

export const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite(): SiteContextValue {
  const value = useContext(SiteContext);
  if (!value) {
    throw new Error("useSite 必须在 SiteContext.Provider 内使用");
  }
  return value;
}
