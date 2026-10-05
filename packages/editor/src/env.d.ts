// 编辑器包以源码形式被 app 消费，不在 app tsconfig 的 include 范围内，
// vite/client 的通配声明对其不可见（TS2882），故在此本地声明 CSS 模块。
declare module "*.css" {}
