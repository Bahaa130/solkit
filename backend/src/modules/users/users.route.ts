// backend/src/modules/users/users.route.ts
import { Router, Response, Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Connection, PublicKey } from "@solana/web3.js"; // 🌐 استدعاء مكتبة الـ Web3 القياسية للتحقق
import { prisma } from "../../config/prisma.js";
import { authenticateJWT, requireAdmin, AuthenticatedRequest } from "../../middlewares/auth.middleware.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_SOLKIT_KEY_2026";
const ADMIN_WALLET = process.env.ADMIN_WALLET || "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";
const MINING_RATES: { [key: number]: number } = { 1: 0.5, 2: 0.525, 3: 0.55 };
const DAILY_REWARDS = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0];

const registerSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  referralCode: z.string().optional().nullable(),
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  walletAddress: z.string().min(32).max(44),
});

// ==========================================
// 🔑 1. مسار تسجيل الدخول وإصدار التوكن
// ==========================================
// 🔑 تحديث مسار تسجيل الدخول وإصدار التوكن ليقرأ الحالة الحية الحقيقية من الـ MySQL
router.post("/login-wallet", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "صيغة المحفظة غير صالحة" });

    const { walletAddress, referralCode } = parsed.data;
    let user = await prisma.user.findUnique({ where: { walletAddress } });
    
    if (!user) {
      const newRefCode = crypto.randomBytes(4).toString("hex");
      const referrer = referralCode ? await prisma.user.findUnique({ where: { referralCode } }) : null;

      user = await prisma.user.create({
        data: {
          email: `${walletAddress.substring(0, 6)}@solkit.com`,
          walletAddress,
          referralCode: newRefCode,
          referrerId: referrer?.id || null,
          activationStatus: "inactive", // الحساب ينزل غير نشط افتراضياً حتى يثبت تفعيله ودفع الرسوم
          currentLevel: 1,
          currentXp: 0,
          balance: 0.0,
        } as any,
      });
    }

    const role = walletAddress === ADMIN_WALLET ? "admin" : "user";
    
    // ⭐ تضمين حالة التفعيل الفعلي الحية الحالية داخل الـ JWT Payload
    const token = jwt.sign(
      { id: user.id, walletAddress: user.walletAddress, role, activationStatus: user.activationStatus },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      message: "Authentication successful",
      token,
      user: { 
        id: user.id, 
        walletAddress: user.walletAddress, 
        role, 
        balance: Number(user.balance), 
        activationStatus: user.activationStatus // 🟢 نقل القيمة الحية الحالية المسجلة بالـ MySQL صراحة (active)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ==========================================
// 💳 2. مسار تفعيل الحساب الصارم والتحقق الفعلي عبر البلوكشين (Solana RPC)
// ==========================================
router.post("/activate-account", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { txHash } = req.body;

    if (!txHash) return res.status(400).json({ message: "رمز توقيع المعاملة TxHash مطلوب للتوثيق!" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { referrer: true }
    });

    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
    if (user.activationStatus === "active") return res.status(400).json({ message: "حسابك مفعّل مسبقاً!" });

    try {
      // 🌐 استخدام الـ Endpoint الصحيح والمستقر لـ Devnet لمنع الانهيار
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const txStatus = await connection.getTransaction(txHash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });

      if (!txStatus) {
        return res.status(400).json({ message: "لم يتم العثور على المعاملة على البلوكشين بعد، أعد المحاولة خلال ثوانٍ" });
      }

      // 🔍 فحص أمني متقدم وثابت: التحقق من المستلم الحقيقي والمبلغ الفعلي للتحويل
      const meta = txStatus.meta;
      if (!meta || meta.err) return res.status(400).json({ message: "المعاملة الممررة فاشلة على البلوكشين!" });

      // قراءة التغيير الفعلي في رصيد محفظة الموقع للتأكد من وصول الأموال (0.01 SOL التجريبية)
      const postBalances = meta.postBalances;
      const preBalances = meta.preBalances;
      const accountKeys = txStatus.transaction.message.getAccountKeys();
      
      let adminIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys.get(i)?.toString() === ADMIN_WALLET) {
          adminIndex = i;
          break;
        }
      }

      if (adminIndex === -1) {
        return res.status(400).json({ message: "احتيال: هذه المعاملة لم ترسل أي أموال لمحفظة الموقع الرسمية!" });
      }

      const receivedAmount = postBalances[adminIndex] - preBalances[adminIndex];
      if (receivedAmount < 10000000) { // التأكد من وصول 0.01 SOL على الأقل
        return res.status(400).json({ message: "المبلغ المرسل غير كافٍ لتنشيط رسوم التفعيل" });
      }

    } catch (blockchainError) {
      console.error("Solana verification breakdown:", blockchainError);
      return res.status(400).json({ message: "فشل السيرفر في التحقق من المعاملة عبر عقدة الـ RPC، حاول مجدداً" });
    }

    // تفعيل الحساب الفعلي وتقسيم الأرباح في الـ MySQL بعد نجاح توثيق البلوكشين
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { activationStatus: "active" }
      });

      if (user.referrerId) {
        await (tx as any).payment.create({ data: { userId, amount: 1.0, currency: "USD", status: "paid", txHash: `${txHash}_site` } });
        await (tx as any).payment.create({ data: { userId: user.referrerId, amount: 1.0, currency: "USD", status: "paid", txHash: `${txHash}_aff` } });
        await tx.user.update({ where: { id: user.referrerId }, data: { balance: { increment: 1.0 } } as any });
      } else {
        await (tx as any).payment.create({ data: { userId, amount: 2.0, currency: "USD", status: "paid", txHash: txHash } });
      }
    });

    return res.json({ message: "تم تفعيل حسابك كمستخدم نشط بنجاح باهر عبر البلوكشين! 🎉", activationStatus: "active" });
  } catch (error) {
    return res.status(500).json({ message: "حدث خطأ داخلي أثناء معالجة تفعيل الحساب" });
  }
});



// ==========================================
// 💸 1. مسارات سحب الأرباح (مرفوعة هنا للأعلى لمنع الـ 404 والـ 500)
// ==========================================

// أ. مسار تقديم طلب سحب مالي جديد
router.post("/withdraw", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "صيغة المدخلات الممررة غير سليمة" });
    }

    const { amount, walletAddress } = parsed.data;
    const MIN_WITHDRAW = 10;
    const GAS_FEE = 0.000005;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || Number(user.balance) < amount) {
      return res.status(400).json({ message: "عذراً، رصيدك المتاح غير كافٍ لإتمام السحب!" });
    }

    if (amount < MIN_WITHDRAW) {
      return res.status(400).json({ message: `الحد الأدنى المسموح به للسحب هو ${MIN_WITHDRAW} عملة!` });
    }

    // خصم وتسجيل المعاملة
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { balance: { decrement: amount } } as any }),
      (prisma as any).withdrawal.create({ data: { userId, amount, walletAddress, gasFee: GAS_FEE, status: "pending" } })
    ]);

    return res.status(201).json({ message: "تم تقديم طلب السحب بنجاح 🟠 قيد التدقيق" });
  } catch (error) {
    console.error("Withdrawal error:", error);
    return res.status(500).json({ message: "Failed to process withdrawal" });
  }
});

// ب. مسار جلب سجل السحوبات الموثق للمستخدم الحالي
router.get("/withdraw-history", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // جلب السجلات والتأكد من مطابقة الأنواع
    const history = await (prisma as any).withdrawal.findMany({ 
      where: { userId }, 
      orderBy: { createdAt: "desc" } 
    });
    
    return res.json(history || []); // إرجاع مصفوفة فارغة بدلاً من تجميد السيرفر بالخطأ 500 لو الجدول فارغ
  } catch (error) {
    console.error("Withdraw history fetch error:", error);
    return res.status(500).json({ message: "Error fetching history data safely" });
  }
});

// ✅ مسار شبكة الإحالة المصلح والمحمي بالكامل 100% ضد الـ Array Syntax Crash
router.get("/referral-network", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج معرف المستخدم بأمان مطلق من التوكن المشفر

    const user = await prisma.user.findUnique({ 
      where: { id: userId }, 
      include: { 
        referrals: { 
          include: { payments: true } 
        } 
      } 
    });
    
    if (!user) return res.status(404).json({ message: "User not found" });

    let totalEarned = 0;
    
    const processed = user.referrals.map((ref: any) => {
      // 💰 التحقق مما إذا كان العضو المدعو قد دفع رسوم التفعيل وتغيرت حالته بنجاح
      const isPaid = ref.activationStatus === "active";
      const bonus = isPaid ? 1.00 : 0.00;
      totalEarned += bonus;

      // 🔐 دالة إخفاء الإيميل المصححة هندسياً لمنع انهيار الـ substring
      let maskedEmail = "u***@solkit.com";
      if (ref.email && ref.email.includes("@")) {
        const parts = ref.email.split("@");
        const usernamePart = parts[0];
        const domainPart = parts[1];
        maskedEmail = usernamePart.substring(0, Math.min(2, usernamePart.length)) + "***@" + domainPart;
      }

      return { 
        id: ref.id, 
        email: maskedEmail, 
        joinDate: ref.createdAt, 
        status: isPaid ? "مفعل ومثبت ✅" : "غير نشط ⏳", 
        bonusEarned: bonus 
      };
    });

    return res.json({ 
      referralCode: user.referralCode, 
      totalReferrals: processed.length, 
      activeReferrals: processed.filter(r => r.status.includes("مفعل")).length, 
      totalReferralEarnings: totalEarned, 
      referralList: processed 
    });
  } catch (error) {
    console.error("Referral network calculation backend error:", error);
    return res.status(500).json({ message: "Error fetching referral network safely" });
  }
});


// ==========================================
// ⛏️ 3. مسارات التعدين والمطالبة بالبونص اليومي (الـ Endpoint المفقود تم إنشاؤه)
// ==========================================

router.get("/mining-status", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.activationStatus !== "active") return res.status(403).json({ message: "Account inactive" });

    const activeSession = await (prisma as any).miningSession.findFirst({
      where: { userId, status: "active" },
      orderBy: { startedAt: "desc" }
    });

    const currentRate = MINING_RATES[user.currentLevel || 1] || 0.5;
    if (!activeSession) return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });

    const now = new Date();
    const timeLeftSeconds = Math.max(0, Math.floor((new Date(activeSession.endsAt).getTime() - now.getTime()) / 1000));

    if (timeLeftSeconds <= 0) {
      const minedAmount = 24 * currentRate;
      await prisma.$transaction([
        (prisma as any).miningSession.update({ where: { id: activeSession.id }, data: { status: "completed", minedAmount } }),
        prisma.user.update({ where: { id: userId }, data: { balance: { increment: minedAmount } } as any })
      ]);
      return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
    }

    const secondsPassed = Math.floor((now.getTime() - new Date(activeSession.startedAt).getTime()) / 1000);
    return res.json({ status: "active", miningRate: currentRate, timeLeft: timeLeftSeconds, endsAt: activeSession.endsAt, pendingMinedAmount: (secondsPassed * currentRate) / 3600 });
  } catch { return res.status(500).json({ message: "Error" }); }
});

router.post("/mining-start", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.activationStatus !== "active") return res.status(403).json({ message: "Forbidden" });

    const currentRate = MINING_RATES[user.currentLevel || 1] || 0.5;
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);

    await (prisma as any).miningSession.create({ data: { userId, miningRate: currentRate, startedAt, endsAt, status: "active" } });
    return res.status(201).json({ message: "Mining started" });
  } catch { return res.status(500).json({ message: "Error" }); }
});

// ✅ 4. مسار المطالبة الفعلي بالبونص اليومي (claim-daily) المفقود
router.post("/claim-daily", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.activationStatus !== "active") return res.status(403).json({ message: "يجب تفعيل الحساب أولاً" });

    // التحقق برمجياً من جدول الـ DailyBonus لمنع استلام الجائزة مرتين في نفس اليوم
    const lastClaim = await (prisma as any).dailyBonus.findFirst({
      where: { userId },
      orderBy: { claimedAt: "desc" }
    });

    let currentStreak = 1;
    if (lastClaim) {
      const hoursDiff = (now.getTime() - new Date(lastClaim.claimedAt).getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        return res.status(400).json({ message: "عذراً، لقد قمت بالمطالبة بالبونص اليوم بالفعل! عد غداً ⏳" });
      } else if (hoursDiff >= 24 && hoursDiff < 48) {
        currentStreak = lastClaim.streakDay >= 7 ? 1 : lastClaim.streakDay + 1;
      } else {
        currentStreak = 1; // تصفير السلسلة للغياب
      }
    }

    const baseReward = DAILY_REWARDS[currentStreak - 1];
    const finalReward = baseReward * (user.currentLevel === 2 ? 1.05 : user.currentLevel === 3 ? 1.10 : 1.0);
    let newXp = (user.currentXp || 0) + 15;
    let newLevel = user.currentLevel || 1;
    if (newXp >= 100) {
      newXp -= 100;
      newLevel += 1;
    }
    await prisma.$transaction([
      (prisma as any).dailyBonus.create({ data: { userId, streakDay: currentStreak, rewardAmount: finalReward, claimedAt: now } }),
      prisma.user.update({ where: { id: userId }, data: { balance: { increment: finalReward }, currentXp: newXp, currentLevel: newLevel } as any })
    ]);
    return res.json({ message: `تمت المطالبة ببونص اليوم ${currentStreak} بنجاح! 🎉`, reward: finalReward, currentLevel: newLevel, xpProgress: `${newXp}/100` });
  } catch (error) {
    return res.status(500).json({ message: "Failed to process bonus" });
  }




});
// ==========================================//
//  👤 5. مسار الحساب العام بالـ ID//
//  ==========================================

  router.get("/:id", async (req, res) => {try {const user = await prisma.user.findUnique({ where: { id: Number(req.params.id)

   }, include: { socialTasks: true, dailyBonuses: true } as any });

  if (!user) return res.status(404).json({ message: "Not found" });
  return res.json(user);} catch { return res.status(500).json({ message: "Error" }); }
});
  export default router;