// 本地 shim：让 Vite 的 ?worker 处理相对路径（monaco 包的 exports 通配
// 与 ?worker 查询组合时无法解析，经此中转绕开）
import "monaco-editor/editor/editor.worker.js";
