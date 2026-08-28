// backend/src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";

const app = express();

// 🧭 خلف Render يوجد وسيط (proxy) واحد يمرّر X-Forwarded-For، لذا نُخبر Express
// أن يثق بأول وسيط ليحصل req.ip على عنوان الزائر الحقيقي وليس عنوان الوكيل.
// (بدون ذلك تبدو كل الطلبات من نفس IP ويتشارك جميع الزوار عتبة الحد مما يسبب إيقافاً جماعياً)
app.set("trust proxy", 1);

// 📦 مسار مجلد الواجهة المبنية (متوافق مع ESM في كل من src/ و dist/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, "../../admin-frontend/dist");

// 1. حماية الرؤوس وتوسيع الـ CSP لتسمح باتصالات البلوكشين وعقد الـ RPC الرسمية لـ Solana
app.use(
  helmet({
    // 🛡️ منع تضمين التطبيق داخل iframe (حماية من هجمات clickjacking على صفحات 404 وغيرها)
    frameguard: { action: "deny" },
    // 🛡️ إخفاء خادم التطبيق من رؤوس الاستجابة
    hidePoweredBy: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: ["'self'", "https://api.devnet.solana.com", "wss://api.devnet.solana.com", "https://api.mainnet-beta.solana.com", "wss://api.mainnet-beta.solana.com"], // 🟢 السماح لعقد الـ RPC (https + websocket للتأكيد)
        upgradeInsecureRequests: [],
      },
    },
  })
);

// 🔓 نسمح بأي أصل (Access-Control-Allow-Origin: *) لأن تطبيق Capacitor يعمل من
// أصل https://localhost (وقد يُرسل Origin: null في بعض إعدادات WebView).
// التطبيق لا يعتمد على ملفات تعريف الارتباط (يستخدم ترويسة Authorization)،
// لذا الإعداد بلا credentials آمن ويتجنّب رفض المتصفح لطلبات الـWebView.
app.use(
  cors({
    origin: "*",
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { message: "طلبات كثيرة جداً، يرجى المحاولة لاحقاً بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
  // 🔑 التحديد لكل مستخدم على حدة:
  // - المعرّف (المحفظة/معرّف المستخدم) من توكن الجلسة إن وُجد → لا يشارك المستخدمون العتبة.
  // - وإلا (زوار قبل تسجيل الدخول) → عنوان IP الحقيقي بعد trust proxy.
  keyGenerator: (req) => {
    try {
      const parts = (req.headers.authorization || "").split(" ");
      if (parts[0] === "Bearer" && parts[1]) {
        const d = jwt.decode(parts[1]) as { id?: number; walletAddress?: string } | null;
        if (d && (d.id || d.walletAddress)) return `u:${d.id ?? d.walletAddress}`;
      }
    } catch { /* تجاهل */ }
    return `ip:${req.ip}`;
  },
});
app.use("/api", limiter);

app.use("/api", router);

// 🚫 معالج 404 موحّد وآمن للمسارات البرمجية (/api/*)
// يمنع كشف بنية الخادم ويُرجع JSON موحّد بدل صفحة خطأ HTML افتراضية
app.use("/api", (req, res) => {
  res.status(404).json({ message: "المسار غير موجود", path: req.path });
});

// 🖥️ خدمة الواجهة المبنية (dist) في بيئة الإنتاج — نشر موحّد (نفس الأصل لـ API + الواجهة)
// هذا يلغي الحاجة لـ Vite proxy الذي يعمل في وضع التطوير فقط.
// يُسجَّل قبل مسار "/" النصي حتى تُخدم الواجهة في جذر الموقع لا نص "API is running".
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));

  // 🔁 تحويل أي مسار غير /api إلى index.html (SPA history fallback)
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  // 🛟 عند غياب الواجهة المبنية (مثلاً تطوير محلي للـ API فقط)
  app.get("/", (_req, res) => {
    res.send("API is secured and running");
  });
}

export default app;
