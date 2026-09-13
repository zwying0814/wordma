// 确保 wasm 产物存在：仅当 pkg/wordma_slug_bg.wasm 缺失时才调用 wasm-pack 构建。
// 作为 `prepare` 生命周期脚本使用，避免每次 `pnpm install` 都重新编译（约 1.5 分钟）。
// 注意：pkg/ 由 wasm-pack 生成并已在 pkg/.gitignore 中忽略，因此新克隆的仓库首次
// 安装会触发一次构建。
import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url))) // packages/slug
const wasm = join(pkgRoot, "pkg", "wordma_slug_bg.wasm")

if (existsSync(wasm)) {
  console.log("[@wordma/slug] wasm 产物已存在，跳过构建。")
  process.exit(0)
}

console.log("[@wordma/slug] 未找到 wasm 产物，开始用 wasm-pack 构建 …")
const r = spawnSync("wasm-pack", ["build", "--target", "web", "--out-dir", "pkg"], {
  cwd: pkgRoot,
  stdio: "inherit",
  // Windows 上 wasm-pack 通常是 .cmd / 批处理包装，需要 shell 才能解析
  shell: process.platform === "win32",
})

if (r.error) {
  console.error(
    "[@wordma/slug] 无法执行 wasm-pack，请先安装：\n" +
      "  rustup target add wasm32-unknown-unknown\n" +
      "  cargo install wasm-pack",
  )
  console.error(r.error.message)
  process.exit(1)
}

process.exit(r.status ?? 1)
