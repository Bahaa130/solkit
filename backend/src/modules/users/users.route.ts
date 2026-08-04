import { Router, Response, Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { authenticateJWT, requireAdmin, AuthenticatedRequest } from "../../middlewares/auth.middleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_SOLKIT_KEY_2026";
const ADMIN_WALLET = process.env.ADMIN_WALLET || "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

const MINING_RATES: { [key: number]: number } = { 1: 0.5, 2: 0.525, 3: 0.55 };

// مخططات التحقق من المدخلات عبر Zod
const registerSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  referralCode: z.string().optional().nullable(),
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  walletAddress: z.string().min(32).max(44),
});

// ==========================================
// 🔑 1. مسار تسجيل الدخول الموحد بـ JWT (في قمة الملف منفرداً)
// ==========================================
router.post("/login-wallet", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "صيغة المحفظة غير صالحة برمجياً" });
    }

    const { walletAddress, referralCode } = parsed.data;
    let user = await prisma.user.findUnique({ where: { walletAddress } });
    
    if (!user) {
      // توليد كود إحالة فريد جديد
      const newRefCode = crypto.randomBytes(4).toString("hex");

      user = await prisma.user.create({
        data: {
          email: `${walletAddress.substring(0, 6)}@solkit.com`,
          walletAddress,
          referralCode: newRefCode,
          referrerId: null,
          currentLevel: 1,
          currentXp: 0,
          balance: 0.0,
        } as any,
      });
    }

    const role = walletAddress === ADMIN_WALLET ? "admin" : "user";
    const token = jwt.sign(
      { id: user.id, walletAddress: user.walletAddress, role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      message: "Authentication successful",
      token,
      user: { id: user.id, walletAddress: user.walletAddress, role, balance: user.balance }
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ==========================================
// ⛏️ 2. مسارات التعدين المحمية بالتوكين (JWT Bearer)
// ==========================================

router.get("/mining-status", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const activeSession = await (prisma as any).miningSession.findFirst({
      where: { userId, status: "active" },
      orderBy: { startedAt: "desc" }
    });

    const userLevel = user.currentLevel || 1;
    const currentRate = MINING_RATES[userLevel] || 0.5;

    if (!activeSession) {
      return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
    }

    const now = new Date();
    if (now >= activeSession.endsAt) {
      const minedAmount = 24 * currentRate;
      await prisma.$transaction([
        (prisma as any).miningSession.update({ where: { id: activeSession.id }, data: { status: "completed", minedAmount } }),
        prisma.user.update({ where: { id: userId }, data: { balance: { increment: minedAmount } } as any })
      ]);
      return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
    }

    const secondsPassed = Math.floor((now.getTime() - activeSession.startedAt.getTime()) / 1000);
    const pendingMinedAmount = (secondsPassed * currentRate) / 3600;
    const timeLeftSeconds = Math.max(0, Math.floor((activeSession.endsAt.getTime() - now.getTime()) / 1000));
    
    return res.json({
      status: "active",
      miningRate: currentRate,
      timeLeft: timeLeftSeconds,
      endsAt: activeSession.endsAt,
      pendingMinedAmount: pendingMinedAmount
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/mining-start", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const activeSession = await (prisma as any).miningSession.findFirst({
      where: { userId, status: "active" }
    });

    if (activeSession && new Date() < activeSession.endsAt) {
      return res.status(400).json({ message: "Mining session is already running" });
    }

    const currentLevel = user.currentLevel || 1;
    const currentRate = MINING_RATES[currentLevel] || 0.5;
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);

    const session = await (prisma as any).miningSession.create({
      data: { userId, miningRate: currentRate, startedAt, endsAt, status: "active" }
    });

    return res.status(201).json({ message: "Mining started successfully", session });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start mining" });
  }
});

// ==========================================
// 💸 3. مسارات سحب الأرباح وشبكة الإحالة والمهمات (المحمية بـ JWT)
// ==========================================

router.post("/withdraw", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "بيانات سحب غير صالحة" });

    const { amount, walletAddress } = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || Number(user.balance) < amount) {
      return res.status(400).json({ message: "رصيدك غير كافٍ!" });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { balance: { decrement: amount } } as any }),
      (prisma as any).withdrawal.create({ data: { userId, amount, walletAddress, gasFee: 0.000005, status: "pending" } })
    ]);

    return res.status(201).json({ message: "Withdrawal submitted" });
  } catch (error) {
    return res.status(500).json({ message: "Withdrawal failed" });
  }
});

router.get("/withdraw-history", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const history = await (prisma as any).withdrawal.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(history);
  } catch (error) {
    return res.status(500).json({ message: "Error fetching history" });
  }
});

router.get("/referral-network", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { referrals: { include: { payments: true } } } });
    if (!user) return res.status(404).json({ message: "User not found" });

    let totalEarned = 0;
    const processed = user.referrals.map((ref: any) => {
      const isPaid = ref.payments.some((p: any) => p.status === "paid");
      const bonus = isPaid ? 1.00 : 0.00;
      totalEarned += bonus;
      return { id: ref.id, email: ref.email, joinDate: ref.createdAt, status: isPaid ? "مفعل ✅" : "غير مفعل ⏳", bonusEarned: bonus };
    });

    return res.json({ referralCode: user.referralCode, totalReferrals: processed.length, activeReferrals: processed.filter(r => r.status.includes("مفعل")).length, totalReferralEarnings: totalEarned, referralList: processed });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching referral data" });
  }
});

router.post("/verify-task", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { taskName, socialUsername } = req.body;
    const existing = await (prisma as any).socialTask.findFirst({ where: { userId: req.user!.id, taskName, isCompleted: true } });
    if (existing) return res.status(400).json({ message: "Task claimed before" });

    await prisma.$transaction([
      (prisma as any).socialTask.create({ data: { userId: req.user!.id, taskName, socialUsername, isCompleted: true, rewardClaimed: 10.0 } }),
      prisma.user.update({ where: { id: req.user!.id }, data: { balance: { increment: 10.0 } } as any })
    ]);
    return res.json({ message: "Task verified!" });
  } catch (error) {
    return res.status(500).json({ message: "Task error" });
  }
});

router.post("/claim-daily", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    await prisma.user.update({ where: { id: userId }, data: { balance: { increment: 2.0 } } as any });
    return res.json({ message: "Bonus Claimed!", reward: 2.0 });
  } catch (error) {
    return res.status(500).json({ message: "Error" });
  }
});

// ==========================================
// 👑 4. مسارات الإدارة العليا (محمية ومطابقة للـ JWT والرتبة)
// ==========================================
router.get("/admin/stats", authenticateJWT, requireAdmin, async (_req, res) => {
  const totalUsers = await prisma.user.count();
  return res.json({ totalUsers, activeMiners: 1, pendingWithdrawals: 0, totalRevenue: totalUsers * 2 });
});

router.get("/admin/pending-withdrawals", authenticateJWT, requireAdmin, async (_req, res) => {
  const pending = await (prisma as any).withdrawal.findMany({ where: { status: "pending" }, include: { user: true } });
  return res.json(pending);
});

// ==========================================//
//  👤 5. مسار جلب المستخدم العام بالـ ID (في نهاية الملف تماماً)//
//  ==========================================//
 router.get("/:id", async (req, res) =>{
  try {
    const user = await prisma.user.findUnique({ where: { id: Number(req.params.id) } 
  
  
  });if (!user) return res.status(404).json({ message: "Not found" });
  
  return res.json(user);} catch { return res.status(500).json({ message: "Error" });

}});
    
    
    
    
    
    export default router;