import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import SiteSwitcher from "../components/SiteSwitcher";
import SidebarNav from "../components/SidebarNav";
import NewSiteModal from "../components/NewSiteModal";
import { InlineAlert } from "../components/common/inline-alert";
import { LoadingScreen } from "../components/common/loading";
import { SiteContext } from "../context/SiteContext";
import {
  getActiveSite,
  listSites,
  setActiveSite,
  type Site,
} from "../lib/site";
import { listArticles, type Article } from "../lib/article";
import {
  listCategories,
  listTags,
  type Category,
  type Tag,
} from "../lib/taxonomy";
import { listPages, type SitePage } from "../lib/pages";
import { listMedia, type MediaItem } from "../lib/media";
import MediaPage from "./MediaPage";
import ArticlesPage from "./ArticlesPage";
import ArticleEditorPage from "./ArticleEditorPage";
import DashboardPage from "./DashboardPage";
import { CategoriesPage, TagsPage } from "./TaxonomyPage";
import PagesPage from "./PagesPage";
import PageEditorPage from "./PageEditorPage";
import ThemePage from "./ThemePage";
import SettingsPage from "./SettingsPage";

export default function HomePage() {
  const [, navigate] = useLocation();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [media, setMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    // 启动检查：没有站点时进入欢迎页；有站点时恢复上次激活的站点
    Promise.all([listSites(), getActiveSite()])
      .then(([list, stored]) => {
        if (list.length === 0) {
          navigate("/welcome", { replace: true });
          return;
        }
        const valid =
          stored != null && list.some((s) => s.id === stored)
            ? stored
            : list[0].id;
        setSites(list);
        setActiveId(valid);
        // 存储的激活站点已不存在时，修正落库
        if (valid !== stored) {
          setActiveSite(valid).catch(() => {});
        }
      })
      .catch((e) => setError(String(e)));
  }, [navigate]);

  // activeSite 需在所有早退 return 之前计算，保证 hooks 顺序稳定
  const activeSite = useMemo(
    () => sites?.find((s) => s.id === activeId) ?? sites?.[0] ?? null,
    [sites, activeId],
  );

  const reloadArticles = useCallback(() => {
    if (activeSite == null) return;
    setArticlesLoading(true);
    listArticles(activeSite.id)
      .then(setArticles)
      .catch((e) => toast.error(`文章加载失败：${String(e)}`))
      .finally(() => setArticlesLoading(false));
  }, [activeSite]);

  useEffect(() => {
    reloadArticles();
  }, [reloadArticles]);

  const reloadTaxonomy = useCallback(() => {
    if (activeSite == null) return;
    setTaxonomyLoading(true);
    Promise.all([listTags(activeSite.id), listCategories(activeSite.id)])
      .then(([t, c]) => {
        setTags(t);
        setCategories(c);
      })
      .catch((e) => toast.error(`标签/分类加载失败：${String(e)}`))
      .finally(() => setTaxonomyLoading(false));
  }, [activeSite]);

  useEffect(() => {
    reloadTaxonomy();
  }, [reloadTaxonomy]);

  const reloadPages = useCallback(() => {
    if (activeSite == null) return;
    setPagesLoading(true);
    listPages(activeSite.id)
      .then(setPages)
      .catch((e) => toast.error(`页面加载失败：${String(e)}`))
      .finally(() => setPagesLoading(false));
  }, [activeSite]);

  useEffect(() => {
    reloadPages();
  }, [reloadPages]);

  const reloadMedia = useCallback(() => {
    if (activeSite == null) return;
    listMedia(activeSite.id)
      .then(setMedia)
      .catch(() => {});
  }, [activeSite]);

  useEffect(() => {
    reloadMedia();
  }, [reloadMedia]);

  // 必须在所有早退 return 之前调用（Rules of Hooks）；
  // activeSite 就绪前值为 null，Provider 只在就绪分支渲染
  const siteContextValue = useMemo(
    () =>
      activeSite
        ? {
            activeSite,
            articles,
            articlesLoading,
            reloadArticles,
            tags,
            categories,
            taxonomyLoading,
            reloadTaxonomy,
            pages,
            pagesLoading,
            reloadPages,
            media,
            reloadMedia,
          }
        : null,
    [
      activeSite,
      articles,
      articlesLoading,
      reloadArticles,
      tags,
      categories,
      taxonomyLoading,
      reloadTaxonomy,
      pages,
      pagesLoading,
      reloadPages,
      media,
      reloadMedia,
    ],
  );

  if (sites === null || activeSite === null) {
    if (error !== null) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <InlineAlert className="max-w-md">
            <div className="font-medium">站点数据加载失败</div>
            <div className="mt-1 break-all">{error}</div>
          </InlineAlert>
        </div>
      );
    }
    return <LoadingScreen />;
  }

  const handleSelect = (id: number) => {
    setActiveId(id);
    setActiveSite(id).catch(() => {
      toast.error("切换站点保存失败，重启后可能回到之前的站点");
    });
  };

  const handleCreated = (site: Site) => {
    setSites((prev) => [...(prev ?? []), site]);
    setActiveId(site.id);
    toast.success(`站点「${site.name}」已创建`);
  };

  return (
    <SiteContext.Provider value={siteContextValue}>
      <div className="flex h-full">
        <aside className="flex w-sidebar shrink-0 flex-col border-r border-border bg-sidebar px-3 pt-3.5 pb-3">
          <div className="flex min-h-0 flex-1 flex-col">
            <SiteSwitcher
              sites={sites}
              activeId={activeSite.id}
              onSelect={handleSelect}
              onCreate={() => setCreateOpen(true)}
            />
            <SidebarNav />
            <div className="mt-auto border-t border-border pt-2.5">
              <span className="text-[11px] text-muted-foreground">
                Wordma v0.1.0
              </span>
            </div>
          </div>
        </aside>
        {/* 各页面自带滚动与内边距（编辑器页为全出血布局） */}
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Switch>
            <Route path="/articles" component={ArticlesPage} />
            <Route path="/editor/:id" component={ArticleEditorPage} />
            <Route path="/tags" component={TagsPage} />
            <Route path="/categories" component={CategoriesPage} />
            <Route path="/media" component={MediaPage} />
            <Route path="/pages" component={PagesPage} />
            <Route path="/pages/edit/:id" component={PageEditorPage} />
            <Route path="/themes" component={ThemePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={DashboardPage} />
          </Switch>
        </main>
      </div>
      <NewSiteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </SiteContext.Provider>
  );
}
