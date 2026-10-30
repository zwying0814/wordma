import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";

// 迁移期临时保留：antd 的 --ant-* 变量挂在这个类下，StyleX 旧样式仍依赖它。
// 第 7 阶段移除 antd 时一并删除。
document.documentElement.classList.add("ant", "css-var-my-theme-id");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
