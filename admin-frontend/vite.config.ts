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
      // 🔧 حزمة buffer الأصلية (تدعم المسارات الفرعية مثل buffer/) — تحل "Buffer is not defined"
      // في مكتبات السولانا (spl-token, spl-token-metadata, web3) وكذلك استيراد buffer/ في سلاسل WalletConnect.
      buffer: path.resolve(configDir, "node_modules/buffer"),
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
