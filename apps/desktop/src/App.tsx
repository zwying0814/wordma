import { Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

import AppLayout from "@/components/sidebar"
import { SpaceOverviewCard } from "@/components/space/space-overview-card"
import { ArticlesPage } from "@/pages/articles"
import { CategoriesPage } from "@/pages/categories"
import { TagsPage } from "@/pages/tags"

/**
 * 用 wouter + hash 路由：
 *  - wouter 是项目脚手架原本就带的路由库（约 1.5KB），切换零新增依赖
 *  - HashRouter 而非 BrowserRouter：Tauri 生产环境的 `tauri://localhost`
 *    自定义协议会吃掉 history 路由的刷新/新窗口，hash 路由在 dev 与
 *    生产环境下行为一致，桌面端也不需要 SEO 友好的 URL
 *
 * AppLayout 自身负责「无空间 / 加载中 / 浏览器预览 / 加载失败」的整页状态，
 * 只有存在笔记空间时才渲染侧边栏并把 children 渲染到内容区。
 */
export default function App() {
  return (
    <Router hook={useHashLocation}>
      <AppLayout>
        <Switch>
          {/* 具体路径先列；wouter 的 Route 默认精确匹配，互不冲突 */}
          <Route path="/articles">
            <ArticlesPage />
          </Route>
          <Route path="/tags">
            <TagsPage />
          </Route>
          <Route path="/categories">
            <CategoriesPage />
          </Route>
          {/* 兜底 "/"：既是首页也是未知路径 */}
          <Route path="/">
            <SpaceHome />
          </Route>
        </Switch>
      </AppLayout>
    </Router>
  )
}

function SpaceHome() {
  return (
    <div className="grid gap-4">
      <SpaceOverviewCard />
    </div>
  )
}
