import {fileURLToPath} from "node:url";

import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
    plugins: [react(), tailwindcss()],

    resolve: {
        alias: {
            // 用 import.meta.url 替代 __dirname：Vite 8 的 native config loader 不再支持后者
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // 直接指向工作区源码包（而非经 node_modules 软链）：既规避某些 Windows 环境下
            // 无法创建目录软链、导致工作区链接失效的问题，又保证包内的 wasm 由 Vite 原生处理。
            "@wordma/slug": fileURLToPath(new URL("../../packages/slug/index.js", import.meta.url)),
        },
    },

    // 若在正常环境下改回按 node_modules 解析（软链存在），仍排除预打包：
    // @wordma/slug 内部用 `new URL('wordma_slug_bg.wasm', import.meta.url)` 定位 wasm，
    // 被 esbuild 预打包会破坏该 URL 解析。
    optimizeDeps: {
        exclude: ["@wordma/slug"],
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: "ws",
                host,
                port: 1421,
            }
            : undefined,
        watch: {
            // 3. tell Vite to ignore watching `src-tauri`
            ignored: ["**/src-tauri/**"],
        },
    },
}));
