import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./main.css";

// html 上的类名 = antd theme.cssVar.key（见 App.tsx），--ant-* 全局变量挂在该类下
document.documentElement.classList.add("ant", "css-var-my-theme-id");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
