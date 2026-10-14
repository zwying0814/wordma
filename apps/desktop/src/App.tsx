import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';

import { SiteProvider, useSite } from '@/context/SiteContext';
import { SidebarNav } from '@/components/SidebarNav';
import { SiteSwitcher } from '@/components/SiteSwitcher';
import { ArticleEditorPage } from '@/pages/ArticleEditorPage';
import { WelcomePage } from '@/pages/WelcomePage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

export default function App() {
  return (
    <SiteProvider>
      <Router hook={useHashLocation}>
        <Routes />
      </Router>
    </SiteProvider>
  );
}

function Routes() {
  const { activeSite, loading } = useSite();

  return (
    <Switch>
      {/* 编辑器页不依赖站点（迁移期直连渲染，T8 起接入数据） */}
      <Route path="/editor/:id">
        <ArticleEditorPage />
      </Route>

      <Route path="/welcome">
        <WelcomePage />
      </Route>

      <Route>
        {loading ? (
          null
        ) : !activeSite ? (
          <WelcomePage />
        ) : (
          <div className="flex h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
              <div className="border-b p-3">
                <SiteSwitcher />
              </div>
              <SidebarNav />
            </aside>
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Switch>
                <Route path="/articles">
                  <PlaceholderPage task="T7" title="文章" />
                </Route>
                <Route path="/pages">
                  <PlaceholderPage task="T13" title="页面" />
                </Route>
                <Route path="/taxonomy">
                  <PlaceholderPage task="T9" title="分类与标签" />
                </Route>
                <Route path="/media">
                  <PlaceholderPage task="T11" title="媒体库" />
                </Route>
                <Route path="/settings">
                  <PlaceholderPage task="T16" title="设置" />
                </Route>
                <Route>
                  <PlaceholderPage task="T7" title="文章" />
                </Route>
              </Switch>
            </main>
          </div>
        )}
      </Route>
    </Switch>
  );
}
