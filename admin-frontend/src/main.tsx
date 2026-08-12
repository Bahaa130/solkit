// src/main.tsx

// 🌐 Polyfill: حقن وتوليد حزم الـ Buffer والـ process لمنع كسر مكتبات سولانا بالمتصفح
import { Buffer } from "buffer";
import process from "process";

(window as any).Buffer = Buffer;
(window as any).process = process;

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { LanguageProvider } from "./i18n/index.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </LanguageProvider>
);
