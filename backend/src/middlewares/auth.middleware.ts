// backend/src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// 🔐 إغلاق آمن: لا يوجد بديل عام — أي بديل ثابت في مستودع مفتوح = تزوير توكنات (تحذير حرج).
// إذا لم تُضبط المتغيرات على Render يتوقف الخادم فوراً ولا يبدأ بحالة غير آمنة.
const requireEnv = (name: string): string => {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v;
};
const JWT_SECRET = requireEnv("JWT_SECRET");
const ADMIN_WALLET = requireEnv("ADMIN_WALLET");

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    walletAddress: string;
    role: "user" | "admin";
  };
}

// ميدل وير للتحقق من أي مستخدم مسجل دخول
export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "عذراً، يجب تسجيل الدخول أولاً!" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "جلسة العمل تالفة أو منتهية الصلاحية، سجل دخولك مجدداً" });
  }
};

// ميدل وير صارم وقفل حديدي للوحة الإدارة فقط
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "admin" || req.user.walletAddress !== ADMIN_WALLET) {
    return res.status(403).json({ message: "صلاحية مرفوضة: هذا النطاق مخصص لإدارة الموقع العليا فقط!" });
  }
  next();
};
