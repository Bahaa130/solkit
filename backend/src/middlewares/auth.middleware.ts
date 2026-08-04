// backend/src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_SOLKIT_KEY_2026";
const ADMIN_WALLET = process.env.ADMIN_WALLET || "ضع_عنوان_محفظتك_الخاصة_كمدير_من_فانتوم";

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
