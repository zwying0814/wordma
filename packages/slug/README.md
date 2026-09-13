# @wordma/slug

把「标题 → slug（文件名）」的逻辑用 Rust 实现并编译为 WebAssembly，供 wordma 前端
（`apps/desktop`）**直接 import 使用，无需 Tauri 后端 / IPC**。

## 依赖

- [`rslug`](https://crates.io/crates/rslug) —— 成熟的 Rust slug 库：小写化、非字母数字折叠、截断。
- [`pinyin-converter`](https://crates.io/crates/pinyin-converter) —— 中文转拼音：词典最长匹配分词、
  去声调（ü→v）、去标点、以 `-` 连接。（注意其 crate 名为 `pinyin-converter`，但库名是 `pinyin`。）

生成规则与后端旧命令 `article_slugify` 同源：

| 输入 | 输出 |
| --- | --- |
| `我的第一篇文章` | `wo-de-di-yi-pian-wen-zhang` |
| `你好世界 & Rust` | `ni-hao-shi-jie-rust` |
| `Hello World!` | `hello-world` |

## 构建

需要 `wasm-pack` 与 `wasm32-unknown-unknown` target：

```bash
rustup target add wasm32-unknown-unknown
wasm-pack build --target web --out-dir pkg   # 或在仓库根目录执行 pnpm slug:build
```

产物在 `pkg/`：`wordma_slug.js`（JS 胶水）、`wordma_slug_bg.wasm`、`*.d.ts`。

## 使用

```ts
import { slugify, initSlug } from "@wordma/slug"

// 直接调用（首个调用会自动加载并实例化 wasm）
const slug = await slugify("我的第一篇文章")

// 可选：应用启动/空闲时提前预热，避免首次点击卡顿
void initSlug()
```

## 说明

- wasm 体积约 **9.5 MB**，主要来自拼音词典。因此采用**懒加载**：只有首次调用
  `slugify` / `initSlug` 时才真正请求并实例化 `.wasm`。
- 若不希望引入这台词典，可改用更轻量的逐字转写方案（体积小一个数量级，代价是多音字
  只能取首读音），详见仓库讨论。
