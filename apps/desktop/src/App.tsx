import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';

import { SiteProvider, useSite } from '@/context/SiteContext';
import { SidebarNav } from '@/components/SidebarNav';
import { SiteSwitcher } from '@/components/SiteSwitcher';
import { ArticleEditorPage } from '@/pages/ArticleEditorPage';
import { ArticlesPage } from '@/pages/ArticlesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PageEditorPage } from '@/pages/PageEditorPage';
import { PagesPage } from '@/pages/PagesPage';
import { TaxonomyPage } from '@/pages/TaxonomyPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { WelcomePage } from '@/pages/WelcomePage';
import { MediaPage } from '@/pages/MediaPage';

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
          <div className="flex h-screen bg-background">
            <aside className="flex w-(--sidebar-width) shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar px-3 pt-3.5 pb-3">
              <SiteSwitcher />
              <SidebarNav />
              <div className="mt-auto flex items-baseline justify-between border-t border-sidebar-border px-2.5 pt-2.5">
                <span className="font-semibold text-muted-foreground text-xs tracking-wide">
                  Wordma
                </span>
                <span className="text-muted-foreground/70 text-xs">
                  本地写作
                </span>
              </div>
            </aside>
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Switch>
                <Route path="/dashboard">
                  <DashboardPage />
                </Route>
                <Route path="/articles">
                  <ArticlesPage />
                </Route>
                <Route path="/pages/editor/:id">
                  <PageEditorPage />
                </Route>
                <Route path="/pages">
                  <PagesPage />
                </Route>
                <Route path="/taxonomy">
                  <TaxonomyPage />
                </Route>
                <Route path="/media">
                  <MediaPage />
                </Route>
                <Route path="/settings">
                  <SettingsPage />
                </Route>
                <Route>
                  <DashboardPage />
                </Route>
              </Switch>
            </main>
          </div>
        )}
      </Route>
    </Switch>
  );
}
