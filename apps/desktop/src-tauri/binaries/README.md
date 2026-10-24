# Tauri sidecar binaries

Bun 不提交进仓库（每个平台约 85 MB）。在当前机器上下载：

```bash
pnpm --filter desktop fetch:bun
```

脚本会把二进制写成 Tauri 要求的名字：

```
src-tauri/binaries/bun-<target-triple>[.exe]
```

例如 Apple Silicon 上是 `bun-aarch64-apple-darwin`。

`pnpm tauri dev` / `pnpm tauri build` 前会自动跑一次下载脚本，已有文件则跳过。
强制重新下载：

```bash
pnpm --filter desktop fetch:bun -- --force
```

版本可通过 `BUN_VERSION` 覆盖，默认 `1.4.4`。

交叉构建时指定目标三元组（CI 里就是这么做的）：

```bash
pnpm --filter desktop fetch:bun -- --target x86_64-apple-darwin
```

也可以用环境变量 `BUN_TARGET` 指定，优先级为 `--target` > `BUN_TARGET` > 当前主机。

`tauri.conf.json` 中对应的配置是 `"externalBin": ["binaries/bun"]`；注意不要带
target triple，Tauri 会按构建目标自动补上。
