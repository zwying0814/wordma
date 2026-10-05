// 设计 token 语义层 —— 值指向 antd v6 注入的全局 CSS 变量（--ant-*），
// 因此跟随 ConfigProvider 主题（换 darkAlgorithm 等）自动联动。
//
// 注意：--ant-* 变量挂在 `.{cssVar.key}` 类下，main.tsx 中挂到 <html> 的类名
// 必须与 App.tsx 里 theme.cssVar.key 一致，变量才能解析。
//
// 用法约定：
// - stylex.create 的组件样式：直接引用 tokens.xxx（类型安全）
// - atoms 一次性样式：用原始变量字符串，如 x.color["var(--ant-color-text)"]
//   （StyleXVar 类型进不了 atoms 动态调用的 (value: string | number) 签名）
//
// 注意：defineVars 文件只能有这一个具名导出（StyleX 约束）。
import * as stylex from "@stylexjs/stylex";

export const tokens = stylex.defineVars({
  bg: "var(--ant-color-bg-layout)", // 设计稿 --bg
  surface: "var(--ant-color-bg-container)", // 设计稿 --surface
  ink: "var(--ant-color-text)", // 设计稿 --ink
  muted: "var(--ant-color-text-tertiary)", // 设计稿 --muted
  line: "var(--ant-color-border-secondary)", // 设计稿 --line
  accent: "var(--ant-color-primary)", // 设计稿 --accent
});
