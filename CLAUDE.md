# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Wordma —— 类 Gridea 的静态博客平台（桌面端）。pnpm monorepo：`apps/desktop` 是 Tauri 2 + React 19 + TypeScript + Vite 应用（Rust 后端 + SQLite），`packages/*` 为 workspace 源码包：

- `@wordma/editor` —— Tiptap 编辑器组件（HTML 存取 + `/` 斜杠命令菜单），对外仅导出 `<WordmaEditor initialValue onChange placeholder />`

workspace 包是**源码包**（`exports` 直接指向 `./src/index.ts`，无构建产物）。UI 栈为 **Tailwind CSS 4 + shadcn/ui v4（`base-nova`，Base UI 内核）+ lucide-react**，设计令牌在 `apps/desktop/src/styles/theme.css`（取值以 `design/styles.css` 为准）。

依赖版本用 **pnpm catalog** 管理（`pnpm-workspace.yaml`）：跨包共享的依赖用 `"catalog:"` 引用；单包内部的版本联动（如 editor 的 `@tiptap/*` 全家桶）在该包 package.json 里用精确版本锁定，不进 catalog。

## 常用命令

```bash
pnpm desktop:dev            # 完整应用（vite + tauri dev，前端端口固定 1420）
pnpm -F desktop dev         # 仅前端热更新（浏览器打开；无 Tauri 后端，invoke 会失败）
pnpm -F desktop build       # tsc + vite build —— 前端改动的验证手段（含类型检查，无独立 linter）
pnpm desktop:build          # Tauri release 打包

cd apps/desktop/src-tauri
cargo test                  # Rust 单测（首次编译较久）
cargo test <test_name>      # 单个测试，如 cargo test active_site_roundtrip
```

`@wordma/editor` 当前未被应用引用，应用构建不会类型检查它；改动该包后单独跑：

```bash
apps/desktop/node_modules/.bin/tsc --noEmit --ignoreConfig --jsx react-jsx \
  --module esnext --moduleResolution bundler --target es2020 --lib es2020,dom \
  --strict --skipLibCheck --allowImportingTsExtensions packages/editor/src/index.ts
```

## 前后端边界

- 前端：`src/lib/site.ts` 里的类型化 `invoke` 封装是唯一入口；不要在组件里直接调 `invoke`。
- Rust：`src-tauri/src/site.rs`，模式是「可测的纯函数（接收 `&Connection`）+ 薄 `#[tauri::command]` 封装」。连接以 `Db(Mutex<Connection>)` 放 Tauri 全局状态，`setup` 中按 `app_data_dir` 初始化。迁移是幂等的 `CREATE TABLE IF NOT EXISTS`（`sites` 表 + `settings` 键值表，激活站点存于 `settings.active_site_id`）。
- 参数命名：JS 侧 camelCase（`siteId`）自动映射 Rust snake_case（`site_id`）；Rust 结构体用 `#[serde(rename_all = "camelCase")]` 返回。新增命令必须登记进 `lib.rs` 的 `generate_handler!`。
- 单测用 `Connection::open_in_memory()` + `db::run_migrations(&conn)`，不需要 Tauri 运行时。**迁移一律加进 `run_migrations`**（生产与测试共用），不要只写在 init_db 里，否则测试库缺列。

## 主题与静态渲染

- **主题包**：`app_data_dir/themes/<name>/`（`theme.yaml` + `templates/*.tera` + `assets/`）；内置默认主题源文件在项目根 `themes/default/`（与 apps/ 同级，随 include_str! 打进二进制），落盘走 manifest 指纹增量更新（未被用户修改的文件随内置版本覆盖，用户修改保留，见 `extract_builtin_theme`）。
- **模板引擎 Tera 2**：`Tera::new()` 是空构造，模板用 `add_template_files` 加载（模板名 = templates 下相对路径，`extends` 按名引用）；对 `.tera` 开启 autoescape，正文 HTML 用 `| safe`。
- **渲染管线**（`theme.rs` `render_site_to`）：路由规则（`routing.rs`，存 settings 键 `routing_rules:{site_id}`）→ `generate_path` 算每篇文章/页面的输出路径（冲突即整体报错）→ 正文转 HTML → 写入 `app_data_dir/preview/{site_id}/`。只有 `published` 文章进入公开站点。
- **内容格式与渲染**：`articles.content` / `pages.content` 存 `content_format` 指定的格式（`html` 为旧数据，`tiptap-json-v1` 为新写入的 Tiptap JSON；写入时按正文形态自动推断）。JSON 正文由 `packages/content-renderer` 调用内置 Bun、复用 `packages/editor-schema` 的扩展清单渲染成 HTML，发布/预览前批量执行一次；缺 Bun 时明确报错。用 `pnpm -F desktop fetch:bun` 获取并校验侧车，`pnpm -F desktop stage:renderer` 生成随包分发的 `content-renderer/cli.js`。首次拉取代码后需先跑 `fetch:bun`（开发与打包都会自动执行）。
- **预览**：`127.0.0.1:12739` 的本地静态服务（惰性启动，按请求读文件，重渲染后无需重启），`open_preview_cmd` 用 opener 插件打开浏览器。

## 路由与启动流

wouter（`App.tsx` 中 `Switch`）：`/welcome` 为首次创建页（已有站点则跳回 `/`），其余路径由 HomePage 布局壳（侧栏 + 主区）承接并在内部按 `/articles`、`/editor/:id` 等分流。两页互为守卫，改动任一页的加载逻辑时保持这个闭环。

**wouter 匹配陷阱**：底层 regexparam 的 `:param*` 只匹配"零或一个路径段"，不是多段通配（`/:rest*` 匹配不上 `/editor/3`）；布局壳等"承接一切"的路由要用显式路径 + 无 `path` 的 `<Route>` 兜底（其内部默认 `pattern = "*"`）。若顶层 Switch 无路由命中，页面会白屏且无报错。

## UI 体系（Tailwind + shadcn）

- **组件分两层**：
  - `src/components/ui/*` —— shadcn CLI 生成（`apps/desktop/components.json`：style `base-nova`、css 指向 `src/styles/theme.css`）。新增组件用 `pnpm -F desktop exec shadcn add <name>`，不要手工重写生成文件；本地只允许扩展变体（如 Badge 的 `success`）。
  - `src/components/common/*` —— 业务基础件：`PageView`、`PageHeader`、`ListCard/ListRow`、`EmptyState`、`ConfirmDialog`、`Field`、`InlineAlert`、`LoadingBlock/LoadingScreen`、`Segmented`、`MultiSelect`、`StatusBadge`、`EditorShell`。新页面优先复用，不要重复拼装。
- **设计令牌**只在 `src/styles/theme.css`：`:root` 放 hex，`@theme inline` 暴露工具类（`bg-card`、`text-muted-foreground`、`shadow-card`、`text-page-title`、`w-sidebar`…），`.dark` 同步维护。`--radius: 10px` 经 base-nova 倍率得到设计稿的 6/8/10 圆角。
- **只用 token**：不要写 `text-gray-500`、`bg-[#fff]` 这类字面值；要新颜色先在 `theme.css` 加 token，再在组件里用工具类。设计稿 hex 也只钉在 `theme.css`。
- `cn` 从 `@/lib/utils` 引入（底层是 `cn` 包，支持条件类名）。
- **Tailwind 扫描范围**：workspace 源码包不在 node_modules 自动扫描内，`theme.css` 中的 `@source "../../../../packages/editor/src"` 不能删，否则编辑器包里的类名不会生成。
- **反馈约定**：一次性动作结果用 sonner 的 `toast()`（`App.tsx` 已挂一次 `<Toaster />`）；二次确认用 `ConfirmDialog`（AlertDialog）；可恢复错误用 `InlineAlert` 或表单内 `Field error`。
- **Base UI 约定**：`DropdownMenuTrigger` / `Dialog` 默认渲染按钮；`Select` 用 `value` / `onValueChange`；多选用 `DropdownMenuCheckboxItem` + `closeOnClick={false}`。
- **布局高度链**：`html/body/#root` 保持 100%，页面根节点 `h-full`。普通页面用 `PageView`（28/36/48 内边距 + 滚动），编辑器用 `EditorShell`。
- **编辑器正文样式**作用域是 `.wm-editor`（`packages/editor/src/editor.css`）；接入编辑器时必须传 `contentClassName="wm-editor"`，否则标题/列表/代码块排版不生效。

## 其他约定

- pnpm 严格 node_modules：新增库要先声明进对应包的 `package.json`，不能依赖传递安装。
- 图标统一来自 `lucide-react`，尺寸用 `size-*`（shadcn 组件的 `[&_svg]` 规则会尊重显式尺寸）。
- 组件库已有的组件优先复用（用户明确要求），样式不一致时通过 className / token 调整，不另起炉灶。
