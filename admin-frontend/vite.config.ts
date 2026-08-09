import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // 🌐 تعريف حزمة الـ global والـ process للمتصفح يدوياً لمنع انهيار الـ web3 بدون حزم خارجية
    global: "globalThis",
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
