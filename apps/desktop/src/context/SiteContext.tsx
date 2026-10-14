import * as React from 'react';

import type { Article, Site } from '@/types/api';
import { getActiveSite, listSites, setActiveSite as setActiveSiteApi } from '@/lib/site';
import { listArticles } from '@/lib/article';

type SiteContextValue = {
  activeSite: Site | null;
  sites: Site[];
  /** 激活站点的文章列表（切换站点时自动刷新） */
  articles: Article[];
  loading: boolean;
  /** 重新加载站点列表与激活站点 */
  reload: () => Promise<void>;
  /** 重新加载激活站点的文章列表 */
  reloadArticles: () => Promise<void>;
  /** 切换激活站点并刷新状态 */
  setActiveSite: (id: number) => Promise<void>;
};

const SiteContext = React.createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [sites, setSites] = React.useState<Site[]>([]);
  const [activeSite, setActiveSiteState] = React.useState<Site | null>(null);
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);

  const activeSiteId = activeSite?.id ?? null;

  const reload = React.useCallback(async () => {
    const [siteList, active] = await Promise.all([
      listSites(),
      getActiveSite(),
    ]);
    setSites(siteList);
    setActiveSiteState(active);
    setLoading(false);
  }, []);

  const reloadArticles = React.useCallback(async () => {
    if (activeSiteId === null) {
      setArticles([]);
      return;
    }
    setArticles(await listArticles(activeSiteId));
  }, [activeSiteId]);

  React.useEffect(() => {
    reload().catch((err) => {
      console.error('加载站点失败:', err);
      setLoading(false);
    });
  }, [reload]);

  React.useEffect(() => {
    reloadArticles().catch((err) => console.error('加载文章失败:', err));
  }, [reloadArticles]);

  const setActiveSite = React.useCallback(
    async (id: number) => {
      await setActiveSiteApi(id);
      await reload();
    },
    [reload]
  );

  const value = React.useMemo(
    () => ({
      activeSite,
      sites,
      articles,
      loading,
      reload,
      reloadArticles,
      setActiveSite,
    }),
    [activeSite, sites, articles, loading, reload, reloadArticles, setActiveSite]
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const ctx = React.useContext(SiteContext);
  if (!ctx) throw new Error('useSite 必须在 SiteProvider 内使用');
  return ctx;
}
