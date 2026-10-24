# Wordma · next

`next` 分支上的全新 monorepo 骨架。旧实现保留在 `dev` 分支，不迁移、不复制。

## 结构

- `apps/desktop` — 桌面端 / 可视化编辑器（待实现）
- `packages/engine` — 静态站点引擎（待实现）

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
pnpm build        # 前端产物构建
pnpm build:app    # 构建当前平台的安装包
```

`pnpm dev` 会自动确保 Bun sidecar 已下载；首次运行会从 npmmirror 拉取。

## 约定

- 包管理使用 pnpm workspace，内部依赖用 `workspace:*`。
- 暂未引入 turbo 等任务编排器；包变多、构建变重后再加。
- 代码按包边界组织，应用只依赖包的公开出口（`exports`）。
