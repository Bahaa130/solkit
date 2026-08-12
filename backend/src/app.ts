// backend/src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";

const app = express();

// 📦 مسار مجلد الواجهة المبنية (متوافق مع ESM في كل من src/ و dist/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, "../../admin-frontend/dist");

// 1. حماية الرؤوس وتوسيع الـ CSP لتسمح باتصالات البلوكشين وعقد الـ RPC الرسمية لـ Solana
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: ["'self'", "https://api.devnet.solana.com", "https://api.mainnet-beta.solana.com"], // 🟢 السماح لعقد الـ RPC
        upgradeInsecureRequests: [],
      },
    },
  })
);

const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { message: "طلبات كثيرة جداً، يرجى المحاولة لاحقاً بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

app.get("/", (_req, res) => {
  res.send("API is secured and running");
});

app.use("/api", router);

// 🖥️ خدمة الواجهة المبنية (dist) في بيئة الإنتاج — نشر موحّد (نفس الأصل لـ API + الواجهة)
// هذا يلغي الحاجة لـ Vite proxy الذي يعمل في وضع التطوير فقط.
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));

  // 🔁 تحويل أي مسار غير /api إلى index.html (SPA history fallback)
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

export default app;
