import { useEffect } from "react"
import { Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"

import AppLayout from "@/components/sidebar"
import { SpaceOverviewCard } from "@/components/space/space-overview-card"
import { warmUpSlug } from "@/lib/slug"
import { ArticleEditorPage } from "@/pages/article-editor"
import { ArticlesPage } from "@/pages/articles"
import { CategoriesPage } from "@/pages/categories"
import { TagsPage } from "@/pages/tags"

/** 浏览器/WebView 的空闲回调（Chromium 支持；Safari 等无此 API）。 */
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number
  cancelIdleCallback?: (handle: number) => void
}

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
  // 首屏渲染完成后，趁空闲把 slug 的 wasm（约 9.5MB）提前加载并实例化，
  // 这样用户第一次点「根据标题生成」时几乎无需等待。
  // 若不需要这点启动期开销，删掉下面这个 useEffect 即可——
  // 打开新建文章对话框时仍会预热（见 create-article-dialog.tsx）。
  useEffect(() => {
    const w = window as IdleWindow
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(() => warmUpSlug())
      return () => w.cancelIdleCallback?.(handle)
    }
    // 无 requestIdleCallback 时退化为「首屏后 2 秒」再加载
    const timer = window.setTimeout(() => warmUpSlug(), 2000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Router hook={useHashLocation}>
      <Switch>
        {/* 编辑页在最前：全屏极简布局，刻意不套侧边栏（写作要一整块画布） */}
        <Route path="/article/:slug">
          <ArticleEditorPage />
        </Route>

        {/* 其余页面共享侧边栏布局 */}
        <Route>
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
        </Route>
      </Switch>
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
