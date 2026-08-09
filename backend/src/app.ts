// backend/src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app = express();

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

export default app;
