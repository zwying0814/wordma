# Wordma · next

`next` 分支上的全新 monorepo 骨架。旧实现保留在 `dev` 分支，不迁移、不复制。

## 结构

- `apps/desktop` — 桌面端 / 可视化编辑器（待实现）
- `packages/content` — 内容模型、zod schema、YAML 解析
- `packages/theme` — 主题契约、PageContext、主题加载
- `packages/engine` — SSG 引擎与 CLI
- `themes/default` — 内置默认主题
- `fixtures/` — 引擎测试输入

## 环境

- Node.js >= 22
- pnpm 12

## 命令

```bash
pnpm install
pnpm dev          # 启动 Tauri 桌面应用
pnpm dev:web      # 只启动 Vite（浏览器访问，Tauri API 不可用）
pnpm typecheck
pnpm test         # Rust 单元测试
pnpm test:contracts   # 内容/主题/引擎契约测试 + fixture 校验
pnpm fixtures:validate
pnpm schema:check     # 重新生成并校验 JSON Schema
pnpm engine --help
pnpm engine inspect --root fixtures/minimal --json
pnpm build        # 前端产物构建
pnpm build:app    # 构建当前平台的安装包
```

`pnpm dev` 会自动确保 Bun sidecar 已下载；首次运行会从 npmmirror 拉取。

## 验证

修改协议、schema 或主题后，至少运行：

```bash
pnpm typecheck
pnpm test:contracts
pnpm schema:check
pnpm engine inspect --root fixtures/minimal --json
```

## 约定

- 包管理使用 pnpm workspace，内部依赖用 `workspace:*`。
- 暂未引入 turbo 等任务编排器；包变多、构建变重后再加。
- 代码按包边界组织，应用只依赖包的公开出口（`exports`）。
- `docs/` 目前是本地文档，不进入版本库；`docs/adr/` 也暂时保持本地。

