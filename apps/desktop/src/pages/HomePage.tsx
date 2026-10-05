import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App as AntdApp, Layout, Spin } from "antd";
import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { Route, Switch, useLocation } from "wouter";
import SiteSwitcher from "../components/SiteSwitcher";
import SidebarNav from "../components/SidebarNav";
import NewSiteModal from "../components/NewSiteModal";
import { SiteContext } from "../context/SiteContext";
import {
  getActiveSite,
  listSites,
  setActiveSite,
  type Site,
} from "../lib/site";
import { listArticles, type Article } from "../lib/article";
import ArticlesPage from "./ArticlesPage";
import ArticleEditorPage from "./ArticleEditorPage";
import DashboardPage from "./DashboardPage";

const { Sider, Content } = Layout;

// 设计稿 --sidebar-w: 236px
const SIDEBAR_WIDTH = 236;

export default function HomePage() {
  const { message } = AntdApp.useApp();
  const [, navigate] = useLocation();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);

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
      .catch((e) => message.error(`文章加载失败：${String(e)}`))
      .finally(() => setArticlesLoading(false));
  }, [activeSite, message]);

  useEffect(() => {
    reloadArticles();
  }, [reloadArticles]);

  // 必须在所有早退 return 之前调用（Rules of Hooks）；
  // activeSite 就绪前值为 null，Provider 只在就绪分支渲染
  const siteContextValue = useMemo(
    () =>
      activeSite
        ? { activeSite, articles, articlesLoading, reloadArticles }
        : null,
    [activeSite, articles, articlesLoading, reloadArticles],
  );

  if (sites === null || activeSite === null) {
    if (error !== null) {
      return (
        <div
          {...stylex.props(
            x.display.flex,
            x.alignItems.center,
            x.justifyContent.center,
            x.height["100%"],
            x.padding._24px,
          )}
        >
          <Alert
            type="error"
            showIcon
            message="站点数据加载失败"
            description={error}
          />
        </div>
      );
    }
    return (
      <div
        {...stylex.props(
          x.display.flex,
          x.alignItems.center,
          x.justifyContent.center,
          x.height["100%"],
        )}
      >
        <Spin />
      </div>
    );
  }

  const handleSelect = (id: number) => {
    setActiveId(id);
    setActiveSite(id).catch(() => {
      message.error("切换站点保存失败，重启后可能回到之前的站点");
    });
  };

  const handleCreated = (site: Site) => {
    setSites((prev) => [...(prev ?? []), site]);
    setActiveId(site.id);
    message.success(`站点「${site.name}」已创建`);
  };

  return (
    <SiteContext.Provider value={siteContextValue}>
      <Layout {...stylex.props(x.height["100%"])}>
        <Sider
          width={SIDEBAR_WIDTH}
          {...stylex.props(
            x.borderRightWidth._1px,
            x.borderRightStyle.solid,
            x.borderRightColor["var(--ant-color-border-secondary)"],
            x.paddingTop._14px,
            x.paddingInline._12px,
            x.paddingBottom._12px,
          )}
        >
          <div
            {...stylex.props(
              x.display.flex,
              x.flexDirection.column,
              x.height["100%"],
              x.minHeight[0],
            )}
          >
            <SiteSwitcher
              sites={sites}
              activeId={activeSite.id}
              onSelect={handleSelect}
              onCreate={() => setCreateOpen(true)}
            />
            <SidebarNav />
            <div
              {...stylex.props(
                x.marginTop.auto,
                x.paddingTop._10px,
                x.borderTopWidth._1px,
                x.borderTopStyle.solid,
                x.borderTopColor["var(--ant-color-border-secondary)"],
              )}
            >
              <span
                {...stylex.props(
                  x.fontSize._11px,
                  x.color["var(--ant-color-text-tertiary)"],
                )}
              >
                Wordma v0.1.0
              </span>
            </div>
          </div>
        </Sider>
        {/* 各页面自带滚动与内边距（编辑器页为全出血布局） */}
        <Content {...stylex.props(x.minWidth[0], x.minHeight[0])}>
          <Switch>
            <Route path="/articles" component={ArticlesPage} />
            <Route path="/editor/:id" component={ArticleEditorPage} />
            <Route component={DashboardPage} />
          </Switch>
        </Content>
      </Layout>
      <NewSiteModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </SiteContext.Provider>
  );
}
