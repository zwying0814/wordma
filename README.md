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
pnpm typecheck
pnpm build
```

## 约定

- 包管理使用 pnpm workspace，内部依赖用 `workspace:*`。
- 暂未引入 turbo 等任务编排器；包变多、构建变重后再加。
- 代码按包边界组织，应用只依赖包的公开出口（`exports`）。
