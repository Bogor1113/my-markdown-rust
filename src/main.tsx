import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 构建时通过 VITE_AUTO_DEVTOOLS=1 开启调试模式：
// 全局捕获 window error / 未处理 rejection 并输出到控制台
//（DevTools 由 Rust 侧在 debug 构建时自动打开；未设置该变量时不影响正式版行为）
if (import.meta.env.VITE_AUTO_DEVTOOLS === "1") {
  window.addEventListener("error", (e) => {
    console.error("[GLOBAL-ERR]", e.message || e.error, "\nstack:", e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[UNHANDLED-REJECTION]", e.reason);
  });
}

// 渲染前应用主题：默认暗黑，用户切换过的用 localStorage 记忆值
const savedTheme = localStorage.getItem("mditor-theme");
document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);