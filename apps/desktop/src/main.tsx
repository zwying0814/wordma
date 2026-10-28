import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App";
import "./App.css";

async function bootstrap() {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(location.search).has("e2e")
  ) {
    const { setupE2EMocks } = await import("./e2e/mock-tauri");
    setupE2EMocks();
  }

  const container = document.getElementById("root");
  if (!container) throw new Error("缺少 #root");

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
