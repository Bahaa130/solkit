// backend/src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app = express();

// 1. حماية رؤوس الـ HTTP لمنع الاختراق وحقن الأكواد
app.use(helmet());

// 2. ضبط جدار الحماية CORS ليتصل فقط وحصرياً بـ دومين الواجهة الأمامية في الإنتاج
const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"] // حصر الهيدرز المسموحة
}));

app.use(express.json());

// 3. تحديد حد أقصى للطلبات (Rate Limiting) لمنع الـ DDoS وهجمات التخمين
// يسمح بـ 100 طلب فقط كل 15 دقيقة لكل عنوان IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { message: "تهديد أمني: لقد قمت بإرسال طلبات كثيرة جداً، يرجى المحاولة لاحقاً بعد 15 دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// المسار الرئيسي للفحص
app.get("/", (_req, res) => {
  res.send("API is secured and running");
});

app.use("/api", router);

export default app;
