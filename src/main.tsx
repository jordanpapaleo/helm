import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QuickCapture } from "./components/QuickCapture";
import { registerBundledIcons } from "./lib/bundled-icons";
import "./styles/globals.css";

// Unicons data has to be in memory before the first Icon render. The component
// otherwise requests api.iconify.design, which this offline app cannot reach.
registerBundledIcons();

// The quick-capture window loads the same bundle; route by window label.
// Outside Tauri (plain-browser dev) there is no window metadata and
// getCurrentWindow throws — fall back to the main app.
function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

const isCapture = currentWindowLabel() === "capture";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isCapture ? <QuickCapture /> : <App />}</React.StrictMode>,
);
