import path from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from '@stylexjs/unplugin';
import tailwindcss from "@tailwindcss/vite";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
      // 迁移期临时共存：StyleX 处理旧样式文件，Tailwind 处理新组件。
      // 迁移完成后移除 stylex 插件（见 docs/ 迁移方案第 7 阶段）。
      stylex.vite({
          useCSSLayers: true,
          // ... other StyleX configuration options
      }),
      tailwindcss(),
      react()
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
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
