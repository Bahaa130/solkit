import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const configDir = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  define: {
    // 🌐 تعريف حزمة الـ global والـ process للمتصفح يدوياً لمنع انهيار الـ web3 بدون حزم خارجية
    global: "globalThis",
  },
  resolve: {
    alias: {
      // 🔧 شيم محلي يوفّر Buffer كتصدير مُسمّى — يحل "Buffer is not defined" في spl-token-metadata
      buffer: path.resolve(configDir, "src/shims/buffer.ts"),
      // منع Vite من اعتبار process وحدة Node خارجية — مكتبات السولانا تعتمد عليها
      process: "process/browser",
    },
  },
  optimizeDeps: {
    include: ["buffer", "process", "@solana/web3.js", "@solana/spl-token"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
