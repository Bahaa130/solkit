import App from "./App.tsx";
import "./index.css";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  // قمنا بإزالة StrictMode لمنع التكرار البصري للمكونات
  <App />
);