# Wordma Electron 迁移开发文档（一期）

> 参照物：Rust 版（main 分支参考实现，Tauri 2 + rusqlite + Tera，已冻结）
> 目标：dev 分支 Electron 应用（Electron 44 + Vite 8 + React 19 + Tailwind v4 + Base UI + Plate.js）
> 关联文档：`docs/blog-editor-plan.md`（编辑器 T1–T13 已完成，成果直接复用）
> 执行方式：按任务顺序逐个完成；每个任务的**端到端验收**全绿才算完成，再进入下一个。

## 已确认决策

- **Rust 全部用 TypeScript 重写**（Electron 主进程），不用 sidecar
- **一期范围**：文章管理（CRUD、草稿/发布、slug、**分类/标签多对多**）、站点配置、独立页面、媒体库、多站点、本地预览构建（单一内置布局）
- **二期**：发布部署（Rust 版从未实现，从零设计）、主题包系统、导入导出、路由规则设置 UI、electron-builder 打包分发
- **存储**：**node:sqlite**（Electron 44.7 内置 Node 24.21 实测可用：DatabaseSync 正常、SQLite 3.53、零原生编译；薄封装隔离 + better-sqlite3 回退预案）+ 媒体文件在磁盘
- **数据目录**：全新目录（`{userData}/wordma/`，`WORDMA_DATA_DIR` 可覆盖），**不继承** Rust 版数据、不做 legacy 迁移
- **内容格式**：HTML（Plate serializeHtml）；**信任编辑器输出，不加 sanitize**（与 Rust 版一致）
- **媒体传输**：路径复制为主（`webUtils.getPathForFile` → 主进程 `fs.copyFile`），剪贴板兜底 base64（限 25MB）；展示用自定义协议 `wordma-media://`
- **模板引擎**：EJS（转义语义对齐 Tera）；RSS 手拼 XML；路由规则 v1 用默认值（校验库就绪，UI 二期）
- **UI 组件体系**：沿用 dev 分支的 **shadcn（base-nova 风格 = Base UI 底座）**；shadcn 没有的组件才用 **TailwindCSS 手写**；**禁止引入 main 分支的 antd/StyleX 体系**

## E2E 基建适配（T1 内完成）

- 既有基建：`e2e/launch.ts` 通过 `electron.launch({args:['electron/main.mjs']})` 启动，先 `vite build` 走 dist 加载 —— 49 条既有用例是全量回归门
- 适配原则：主进程 TS 经 esbuild 打包到 **`electron/main.mjs` 原路径**，launch.ts 零改动
- 新增：每个测试进程用 `WORDMA_DATA_DIR` 指向临时目录（数据隔离）；`e2e` 脚本改为 `vite build && build:main && playwright test`
- 通用验收：`pnpm --filter desktop exec tsc -b` 通过 + `pnpm --filter desktop run e2e` 全绿 + 既有用例无回归

---

## 任务开发清单

### T1 · 主进程打包管线 + 启动骨架

**改动**：devDependencies 加 `esbuild`；`electron/src/main.ts`（数据目录解析、DB 初始化挂载、窗口创建迁移）、`electron/src/preload.ts`（contextBridge 白名单脚手架 + 演示通道 `app_info`）；esbuild 双入口打包到 `electron/main.mjs` + `electron/preload.mjs`；`package.json` 补 `"main"` 与 `build:main` 脚本；`e2e` 脚本串联；`WORDMA_DATA_DIR` 支持。

**端到端验收（`e2e/smoke2.spec.ts`）**：
1. 既有 49 条 E2E 不回归
2. 隔离数据目录下启动后 `wordma.db` 文件生成
3. `window.api.invoke('app_info')` 返回版本信息（preload 链路通）
4. 打包产物（非源码）启动可用

### T2 · 数据库层：node:sqlite 薄封装 + 全量 DDL

**改动**：`electron/src/db.ts`（open/migrate/get/all/run/tx，BEGIN/COMMIT 手工事务，`PRAGMA foreign_keys = ON`）；`electron/src/migrations.ts`（附录 B 的 9 张表 DDL，幂等单批次）。

**端到端验收**：
1. T1 smoke 保持全绿
2. 启动后检查 `sqlite_master` 含全部 9 张表（可通过演示通道暴露 `db_tables` 调试通道，验收后删除或保留为内部通道）

### T3 · 站点服务 + IPC（多站点第一步）

**改动**：`electron/src/settings.ts`（KV get/set）、`site.ts`（CRUD + active_site_id）、`ipc-register.ts`（`list_sites`/`create_site`/`update_site`/`delete_site`/`get_active_site`/`set_active_site`/`get_setting`/`set_setting` 白名单注册）；校验：站点名 ≤30、描述 ≤100。

**端到端验收**：
1. `create_site` → `list_sites` 出现；重名允许（Rust 版允许多个同名站点，id 区分）
2. `set_active_site` → 重启进程后 `get_active_site` 不变（持久化）
3. `delete_site` → 级联清空该站点资源（先用 `set_setting` 造数据验证）
4. 超长站点名创建被拒（中文错误消息）

### T4 · 应用壳：wouter 路由 + 站点切换器 + 导航

**改动**：加 `wouter` 依赖；`App.tsx` 改 wouter Switch；`context/SiteContext.tsx`（activeSite + reload 模式）；`pages/WelcomePage.tsx`（无站点引导）、`components/SiteSwitcher.tsx`、`components/SidebarNav.tsx`（复用已有 button/dropdown-menu，缺的组件先 `shadcn add`）；现有编辑器页面挂到 `/editor/:id`（暂以"无文章列表"的直连方式可进入，T9 接管）。

**端到端验收**：
1. 无站点时显示 Welcome → 创建第一个站点 → 进入主界面
2. 站点切换器切换后各页面数据跟随（以 activeSiteId 为准）
3. 既有编辑器 E2E 不回归（编辑器页路由化后仍可用）

### T5 · 文章服务 + IPC

**改动**：`electron/src/article.ts`（CRUD + slug 生成/校验 + 分类标签全量替换同步）；IPC：`list_articles`/`get_article`/`create_article`/`update_article`/`delete_article`；校验对齐 5.3（slug 规则、默认 8 位随机字母撞库重试 ≤5 次）。

**端到端验收**：
1. `create_article`（仅标题）→ 默认 slug 为 8 位小写字母、status 为 draft
2. `update_article` 改 slug 为非法值（大写/空格/`--`）→ 中文错误消息
3. `update_article` 携带 categories/tags id 数组 → `get_article` 返回 ArticleRef[]；再次 update 传空数组 → 关联清空（全量替换语义）
4. `delete_article` → article_tags/article_categories 级联清空
5. 同站点 slug 唯一：重复 slug 被拒

### T6 · 分类/标签服务 + IPC

**改动**：`electron/src/taxonomy.ts`（list/create/rename/delete ×2，带 article_count LEFT JOIN）；IPC 8 个通道。

**端到端验收**：
1. `create_tag` 重名 → 返回已有行（复用语义，不报错）
2. `rename_tag` 撞已有名 → 报错
3. `delete_tag` → article_tags 级联清空；`list_tags` 的 articleCount 正确
4. 分类同上三项

### T7 · 文章列表页

**改动**：`pages/ArticlesPage.tsx`（列表：标题/slug/状态徽标/分类标签/更新时间；草稿/发布筛选；删除确认；表格与徽标用 `shadcn add table badge` 产出）；SiteContext 接入 `reloadArticles`；侧边导航挂 `/articles`。

**端到端验收**：
1. 新建文章（弹窗或默认创建）→ 列表出现、状态为草稿
2. 状态筛选切换正确；删除后列表移除
3. 点击列表项进入 `/editor/:id`

### T8 · 文章编辑器页集成

**改动**：`pages/ArticleEditorPage.tsx`：标题输入、slug 输入（自动生成按钮）、状态切换（草稿/发布）、分类/标签多选器、Plate 编辑器（复用 `components/editor/`）、保存（`serializeHtml` → `update_article`）与"保存并预览"占位、字数统计（`lib/words.ts`）。表单控件用 `shadcn add input switch badge`（Base UI 底座），多选器基于已有 dropdown-menu/popover 组合。

**端到端验收**：
1. 新建 → 输入标题 + 编辑器输入富文本（加粗/列表/代码块）→ 保存 → 刷新后内容还原
2. 保存时 slug 留空 → 自动生成；非法 slug → 行内中文错误提示
3. 切换状态 draft→published → 列表徽标更新
4. 选择分类/标签 → 保存后重进页面选中态还原
5. 既有编辑器 E2E（`e2e/smoke.spec.ts` 等）全部不回归

### T9 · 分类/标签管理页

**改动**：`pages/TaxonomyPage.tsx`（两栏：分类/标签各自列表 + 新建/重命名/删除，显示文章数）。

**端到端验收**：
1. 新建重名 → 复用不报错（列表不重复出现）
2. 重命名撞名 → 行内错误；删除 → 关联文章上的该标签消失（文章编辑页验证）
3. articleCount 与实际文章数一致

### T10 · 媒体服务 + 自定义协议

**改动**：`electron/src/media.ts`（`upload_media_from_path`：preload `webUtils.getPathForFile` → `fs.copyFile`；`upload_media_data`：base64 兜底 ≤25MB；白名单 png/jpeg/gif/webp/svg、mp4/webm/mov；`{millis}-{nanos:08x}.{ext}`；失败回滚删文件；删除连带删文件）；`list_media`/`delete_media` IPC；主进程注册 `wordma-media://` 协议（`protocol.handle`，支持 Range）。

**端到端验收**：
1. 上传 png（路径通道）→ `list_media` 出现、`wordma-media://{siteId}/{filename}` 可访问（fetch 断言 200 与 content-type）
2. 上传 .txt → 被拒；上传 >25MB base64 → 被拒
3. `delete_media` → 磁盘文件消失、协议访问 404
4. 同名上传两次 → 文件名不同（毫秒+纳秒）均存在

### T11 · 媒体库页 + 编辑器插图

**改动**：`pages/MediaPage.tsx`（网格预览、上传按钮、删除）；`components/MediaPickerModal.tsx`；Plate 编辑器的 ImageToolbarButton 弹层加"从媒体库选择"入口（插入 `wordma-media://{siteId}/{filename}`）。

**端到端验收**：
1. 媒体页上传 2 张图 → 网格展示 2 项
2. 编辑器 → 图片按钮 → 媒体库选择 → `img[src^="wordma-media://"]` 出现且可见
3. 删除媒体 → 编辑器中该图变为裂图（不阻塞编辑）

### T12 · 独立页面服务 + IPC

**改动**：`electron/src/pages.ts`（CRUD + show_in_nav + sort_order + slug 唯一）；IPC 5 通道。

**端到端验收**：
1. `create_page` → slug 唯一冲突报错；`update_page` 改 show_in_nav → 生效
2. `delete_page` 级联无残留

### T13 · 独立页面 UI

**改动**：`pages/PagesPage.tsx` + `pages/PageEditorPage.tsx`（复用 Plate 编辑器 + 标题/slug/导航开关/排序）。

**端到端验收**：
1. 新建页面"关于" → 编辑内容 → 保存还原
2. show_in_nav 开关切换 → 持久化
3. slug 冲突行内提示

### T14 · 路由规则库（校验 + 默认值）

**改动**：`electron/src/routing.ts`（RoutingRules 默认值 8 条、占位符允许集、`validateRoutingRules` → RouteCheck[]；纯函数）—— v1 仅存储默认值 + 渲染使用；设置 UI 二期。

**端到端验收**：
1. 纯函数单测式 E2E：非法规则（含 `..`、`//`、`assets` 前缀、缺 `[num]`）产出 ok:false + 中文 message（通过临时调试通道或在 M6 渲染失败路径间接验证）

### T15 · 静态渲染管线

**改动**：`electron/src/render.ts`（管线对齐 5.1：清 dist → 数据 → URL 冲突检测 → EJS 渲染 7 类页面 → RSS 手拼 → assets/media 拷贝 → RenderReport）；`electron/src/templates/`（base/index/post/page/archive/taxonomies 六个 EJS 内置布局，TS 字符串模块）；`render_site` IPC。

**端到端验收**：
1. 造数据（2 篇发布 + 1 篇草稿 + 分类/标签 + 1 页面）→ `render_site` → 临时目录输出物断言：index.html 含 2 篇发布（草稿不在列表）、post/{slug}.html 含正文 HTML、category/{slug}/index.html、tag/{slug}/index.html、archive/index.html 按年分组、categories/index.html、tags/index.html、{pageSlug}.html、feed.xml 含 2 条 item
2. 两篇文章 slug 撞页面 slug → 渲染失败并报"路径冲突"
3. 草稿在 includeDrafts 预览模式下有详情页

### T16 · 预览服务器 + 设置页 v1

**改动**：`electron/src/preview.ts`（node:http：127.0.0.1:12739 默认、1024–65535 可配、PREVIEW_DIR 热切换、防路径穿越、MIME 表、EADDRINUSE 可读错误、`WORDMA_PREVIEW_PORT`）；`open_preview`/`get_preview_port`/`set_preview_port` IPC；`pages/SettingsPage.tsx`（站点信息编辑 + 预览端口 + 打开预览按钮）。

**端到端验收**：
1. `render_site` + `open_preview` → `fetch('http://127.0.0.1:{port}/')` 200 且内容为构建产物；`fetch('/post/{slug}.html')` 200
2. 访问 `/../etc/passwd` → 404（穿越防护）
3. `set_preview_port` 改端口 → 新端口生效
4. 设置页改站点名 → 重新渲染后 index.html 的 `<title>`/站点名更新

### T17 · 一期终验

**改动**：无新功能；修遗留问题。

**端到端验收**：
1. `tsc -b` + `pnpm --filter desktop run build`（渲染层）+ `build:main` 通过
2. 全量 E2E（既有 49 条 + T1–T16 新增）全绿
3. 残留检查：`grep -rnE "@radix-ui|@ariakit|cmdk|lodash|@udecode/cn|better-sqlite3|electron-builder" apps/desktop` 一期零出现
4. 手动走查：多站点切换全流程、编辑器全功能、媒体上传、预览浏览（中文输入法、窗口缩放）

---

## 附录 A · 依赖变更

```bash
pnpm --filter desktop add wouter ejs
pnpm --filter desktop add -D esbuild @types/ejs
```

其余全部使用已有/内置（node:sqlite、node:http、protocol、webUtils）。

**UI 组件获取策略**：优先 `pnpm dlx shadcn@latest add <component>`（components.json 已配置 base-nova 风格，产 Base UI 底座组件；一期预计需补：input、dialog、select、badge、switch、table、tabs 等）；shadcn 没有的才用 TailwindCSS 手写；**禁止引入 main 分支的 antd/StyleX**。

**一期禁用**：better-sqlite3、electron-builder、sanitize-html、状态库、antd、StyleX。

## 附录 B · 数据模型（DDL 全文）

```sql
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(site_id, name)
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(site_id, name)
);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(site_id, slug)
);
CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);
CREATE TABLE IF NOT EXISTS article_categories (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, category_id)
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  show_in_nav INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(site_id, slug)
);
```

**settings 键清单（v1）**：`active_site_id`、`routing_rules:{siteId}`（v1 存默认值）、`preview_port`。二期：`active_theme:*`、`theme_settings:*`。

**数据目录布局**：`{userData}/wordma/` 下 `wordma.db`、`media/{siteId}/`、`preview/{siteId}/`。

## 附录 C · IPC 通道清单（v1，28 个）

| 模块 | 通道 |
|---|---|
| 基建 | `app_info`（T1 演示） |
| site | `list_sites` `create_site` `update_site` `delete_site` `get_active_site` `set_active_site` |
| settings | `get_setting` `set_setting` |
| article | `list_articles` `get_article` `create_article` `update_article` `delete_article` |
| taxonomy | `list_tags` `create_tag` `rename_tag` `delete_tag` `list_categories` `create_category` `rename_category` `delete_category` |
| pages | `list_pages` `get_page` `create_page` `update_page` `delete_page` |
| media | `list_media` `upload_media_from_path` `upload_media_data` `delete_media` |
| render/preview | `render_site` `open_preview` `get_preview_port` `set_preview_port` |

二期：`theme_*` 7 个 + `validate_routing_rules`。约定：channel 名 = Rust 命令名；参数/返回 camelCase；handler 抛中文 Error。

## 附录 D · 静态渲染输出映射（默认路由规则）

| 内容 | 输出路径 |
|---|---|
| 首页 / 第 N 页 | `index.html`、`page/{num}/index.html` |
| 文章详情 | `post/{slug}.html` |
| 独立页面 | `{slug}.html` |
| 分类列表 | `category/{slug}/index.html` |
| 标签列表 | `tag/{slug}/index.html` |
| 归档（按年） | `archive/index.html` |
| 总览 | `categories/index.html`、`tags/index.html` |
| RSS | `feed.xml` |
| 布局资源 / 媒体 | `assets/`、`media/`（整目录拷贝） |

渲染上下文（对齐 Rust）：`post.{title,date,contentHtml,categories,tags,categoriesText,tagsText,wordCount}`；`page.{title,contentHtml}`；`posts[] + pagination.{current,total,prevUrl,nextUrl}`；`taxonomy.{kind,name}`；全局 `site.{name,description,url}` + `urls.{archive,categories,tags}` + `pages[{title,url,showInNav}]`。

## 附录 E · 校验规则汇总（与 Rust 逐条对齐）

| 字段 | 规则 |
|---|---|
| slug | 小写 a-z0-9 连字符；段非空、无首尾连字符；≤80；默认 8 位随机小写字母（撞库重试 ≤5 次） |
| 标签/分类名 | ≤20；创建重名 → 复用已有行；改名撞名 → 报错 |
| 站点名 / 描述 | ≤30 / ≤100 |
| 字数统计 | 剥除 HTML 标签后非空白字符数 |
| 路由规则 | 字符集白名单、禁 `..`/`//`、`assets` 前缀保留、占位符白名单（post: slug,id,year,month,day；page/category/tag: slug,id；indexPagination 必含 `[num]`；feed 禁占位符） |

## 附录 F · Tauri/Rust → Electron 对照表

| Tauri/Rust | Electron |
|---|---|
| `app_data_dir` | `app.getPath('userData')/wordma`（`WORDMA_DATA_DIR` 覆盖） |
| `invoke()` | contextBridge + `ipcRenderer.invoke`（白名单） |
| `generate_handler!` | `ipcMain.handle` 注册表（ipc-register.ts） |
| `State<Db>` + `Mutex<Connection>` | 主进程模块单例（单线程无需锁） |
| rusqlite（bundled） | node:sqlite `DatabaseSync` |
| Tera | EJS（内置单布局） |
| asset protocol | `protocol.handle('wordma-media')` |
| `tauri_plugin_opener` | `shell.openExternal` / `shell.openPath` |
| capabilities 权限清单 | contextIsolation + preload 白名单 |
| 手写 TcpListener 预览 | node:http |
| chrono / rand | `Date` / `node:crypto` |
| base64 媒体上传 | 路径复制（`webUtils.getPathForFile` + `fs.copyFile`） |

## 附录 G · 风险清单

| 风险 | 应对 |
|---|---|
| node:sqlite 官方标记 "Active development" | 已实测 Electron 44 可用；db.ts 薄封装隔离；回退 better-sqlite3 + @electron/rebuild |
| 主进程打包影响 E2E | 产物固定 `electron/main.mjs` 原路径；`e2e` 脚本串联 `build:main`；49 条既有用例为回归门 |
| 文章 HTML 信任边界 | 已拍板信任 Plate 输出（白名单 HTML）；未来引入第三方内容源再评估 sanitize-html |
| 媒体大文件内存 | 路径复制通道规避；base64 兜底限 25MB |
| SQLite 备份 | 单文件非 WAL，关闭应用后整文件拷贝；导入导出二期 |
| 预览端口冲突 | EADDRINUSE 转可读提示；`WORDMA_PREVIEW_PORT` 供 CI |
| E2E 数据隔离 | 每测试进程 `WORDMA_DATA_DIR` 指向临时目录 |

## 附录 H · 二期路线（按优先级）

1. **发布部署**：GitHub Pages（git push / API）——从零设计，远端配置 UI + 构建产物推送
2. **主题包系统**：theme.yaml（settings schema）+ templates 目录 + SHA-256 指纹提取移植
3. **路由规则设置 UI**：RouteCheck 可视化（校验库 T14 已就绪）
4. **导入导出**：markdown 批量导入、全站备份
5. **electron-builder 打包分发**：macOS dmg / Windows installer（asar 与自定义协议路径处理）
