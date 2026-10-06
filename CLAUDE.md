# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Wordma —— 类 Gridea 的静态博客平台（桌面端）。pnpm monorepo：`apps/desktop` 是 Tauri 2 + React 19 + TypeScript + Vite 应用（Rust 后端 + SQLite），`packages/*` 为 workspace 源码包：

- `@wordma/ui` —— 共享设计 token（`defineVars` 别名层，指向 `--ant-*` 变量）
- `@wordma/editor` —— Tiptap 编辑器组件（markdown 存取 + `/` 斜杠命令菜单），对外仅导出 `<WordmaEditor initialValue onChange placeholder />`

workspace 包是**源码包**（`exports` 直接指向 `./src/index.ts`，无构建产物）：StyleX 必须由消费方构建管线编译，app 的 unplugin 会自动处理它们（已验证 `transformInclude` 不排除 node_modules 符号链接）。UI 上 antd + StyleX 的用法约定对所有包一致。

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

## 前后端边界

- 前端：`src/lib/site.ts` 里的类型化 `invoke` 封装是唯一入口；不要在组件里直接调 `invoke`。
- Rust：`src-tauri/src/site.rs`，模式是「可测的纯函数（接收 `&Connection`）+ 薄 `#[tauri::command]` 封装」。连接以 `Db(Mutex<Connection>)` 放 Tauri 全局状态，`setup` 中按 `app_data_dir` 初始化。迁移是幂等的 `CREATE TABLE IF NOT EXISTS`（`sites` 表 + `settings` 键值表，激活站点存于 `settings.active_site_id`）。
- 参数命名：JS 侧 camelCase（`siteId`）自动映射 Rust snake_case（`site_id`）；Rust 结构体用 `#[serde(rename_all = "camelCase")]` 返回。新增命令必须登记进 `lib.rs` 的 `generate_handler!`。
- 单测用 `Connection::open_in_memory()` + `db::run_migrations(&conn)`，不需要 Tauri 运行时。**迁移一律加进 `run_migrations`**（生产与测试共用），不要只写在 init_db 里，否则测试库缺列。

## 主题与静态渲染

- **主题包**：`app_data_dir/themes/<name>/`（`theme.yaml` + `templates/*.tera` + `assets/`）；内置默认主题通过 `include_str!` 打进二进制，落盘走 manifest 指纹增量更新（未被用户修改的文件随内置版本覆盖，用户修改保留，见 `extract_builtin_theme`）。
- **模板引擎 Tera 2**：`Tera::new()` 是空构造，模板用 `add_template_files` 加载（模板名 = templates 下相对路径，`extends` 按名引用）；对 `.tera` 开启 autoescape，正文 HTML 用 `| safe`。
- **渲染管线**（`theme.rs` `render_site_to`）：路由规则（`routing.rs`，存 settings 键 `routing_rules:{site_id}`）→ `generate_path` 算每篇文章/页面的输出路径（冲突即整体报错）→ pulldown-cmark 转 HTML → 写入 `app_data_dir/preview/{site_id}/`。只有 `published` 文章进入公开站点。
- **预览**：`127.0.0.1:12739` 的本地静态服务（惰性启动，按请求读文件，重渲染后无需重启），`open_preview_cmd` 用 opener 插件打开浏览器。

## 路由与启动流

wouter（`App.tsx` 中 `Switch`）：`/welcome` 为首次创建页（已有站点则跳回 `/`），其余路径由 HomePage 布局壳承接并在内部按 `/articles`、`/editor/:id` 等分流。两页互为守卫，改动任一页的加载逻辑时保持这个闭环。

**wouter 匹配陷阱**：底层 regexparam 的 `:param*` 只匹配"零或一个路径段"，不是多段通配（`/:rest*` 匹配不上 `/editor/3`）；布局壳等"承接一切"的路由要用显式路径 + 无 `path` 的 `<Route>` 兜底（其内部默认 `pattern = "*"`）。若顶层 Switch 无路由命中，页面会白屏且无报错。

## StyleX 体系（本项目最容易踩坑的部分）

写法规范见 `docs/styleX.md`（项目内权威指南），要点：

- 习惯用法：`@stylexjs/atoms` 行内原子（`x.display.flex`；数字开头的值加 `_` 前缀如 `x.padding._16px`；复杂值用计算属性如 `x.height["100%"]`），经 `{...stylex.props(...)}` 展开。`stylex.create` 块只用于伪类/状态（atoms 表达不了 `:hover`）。
- **级联规则（关键）**：`vite.config.ts` 开了 `useCSSLayers: true`，StyleX 输出在 `@layer` 里，而 antd 注入的是未分层样式 —— 同元素同属性冲突时 antd 必胜。因此**永远不要用 StyleX 覆盖 antd 组件的内部样式**（Button 的 padding/高度、Avatar 底色等）；改 antd 组件观感走 `ConfigProvider` 的 `theme.token` / `theme.components`。StyleX 用在自有元素、或 antd 未设置的属性上是安全的。
- 主题对接：antd v6 CSS 变量模式默认开启，`--ant-*` 变量挂在 `.{cssVar.key}` 类下 —— `App.tsx` 的 `theme.cssVar.key` 必须与 `main.tsx` 挂到 `<html>` 的类名一致（当前都是 `css-var-my-theme-id`），改任一边必须同步。
- `@wordma/ui`（`packages/ui`）是语义别名层（`defineVars` 指向 `var(--ant-*)`）：`stylex.create` 里引用 `tokens.*`；atoms 里用原始字符串 `x.color["var(--ant-color-text)"]`（`StyleXVar` 类型进不了 atoms 的 `(value: string | number)` 签名）。
- 高度链：`main.css` 设 `html/body/#root` 100%，页面根节点 `height: "100%"`。antd `App` 组件必须写成 `<AntdApp component={false}>` —— 它默认渲染的 `.ant-app` div 无高度，会断掉整条链。

## 其他约定

- antd 参考：读 https://ant.design/llms-full.txt 了解 Ant Design 组件，编写 antd 相关代码时直接运用这些知识（组件 props、语义化 `styles`/`classNames`、v6 变更等），避免凭旧版本记忆使用 API。

- pnpm 严格 node_modules：antd 的传递依赖（如 `@ant-design/icons`）不能直接 import，需先声明进 `apps/desktop/package.json`。
- 设计稿的 hex 值（如 `#3563D9`、`#FBFBFC`）应钉在 `ConfigProvider` 的 theme 里，组件层只引用变量；把设计值补进 theme 即可让全站跟随。
- 图标来自 `@ant-design/icons`，复用 antd 组件优先于自绘（用户明确要求：组件库有的就复用，样式允许不一致）。
