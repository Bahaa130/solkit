// backend/src/modules/users/users.route.ts
import { Router, Response, Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { authenticateJWT, requireAdmin, AuthenticatedRequest } from "../../middlewares/auth.middleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_SOLKIT_KEY_2026";
const ADMIN_WALLET = process.env.ADMIN_WALLET || "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

// ==========================================
// 🛡️ مخططات التحقق وتنظيف المدخلات (Zod Validation)
// ==========================================
const registerSchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "صيغة محفظة سولانا غير سليمة!"),
  referralCode: z.string().optional().nullable(),
});

// ==========================================
// 🛠️ دالات مساعدة (Helper Functions)
// ==========================================

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

async function generateUniqueReferralCode() {
  let code = generateReferralCode();
  while (await prisma.user.findUnique({ where: { referralCode: code } })) {
    code = generateReferralCode();
  }
  return code;
}

// دالة برمجية للتحقق من تكوين عناوين محافظ Solana (بين 32 و 44 حرفاً)
function isValidSolanaAddress(address: string): boolean {
  const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return solanaRegex.test(address);
}

// ==========================================
// 🔑 1. مسار تسجيل الدخول وإصدار الـ JWT (يجب وضعه هنا في البداية المطلقة!)
// ==========================================

router.post("/login-wallet", async (req: Request, res: Response) => {
  try {
    // فحص المدخلات فوراً بـ Zod لتنظيف البيانات وحماية قاعدة بيانات MySQL من الاختراق
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "صيغة محفظة سولانا الممررة غير صالحة برمجياً" });
    }

    const { walletAddress, referralCode } = parsed.data;
    
    // البحث عن المستخدم الحالي بناءً على محفظته الفرعية
    let user = await prisma.user.findUnique({ where: { walletAddress } });
    
    // إذا كان مستخدماً جديداً، نقوم بإنشائه تلقائياً في قاعدة البيانات
    if (!user) {
      const referrer = referralCode ? await prisma.user.findUnique({ where: { referralCode } }) : null;
      const newRefCode = await generateUniqueReferralCode();

      user = await prisma.user.create({
        data: {
          email: `${walletAddress.substring(0, 6)}@solkit.com`,
          walletAddress,
          referralCode: newRefCode,
          referrerId: referrer?.id || null,
          currentLevel: 1,
          currentXp: 0,
          balance: 0.0,
        } as any,
      });
    }

    // تحديد رتبة الحساب بناءً على تطابق بصمة البلوكشين مع محفظتك الفعالة
    const role = walletAddress === ADMIN_WALLET ? "admin" : "user";

    // توليد التوكن المشفر الصارم الصالح لمدة 24 ساعة للملاحة الآمنة
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
    return res.status(500).json({ message: "Failed to authenticate wallet" });
  }
});

// ==========================================
// 👥 مسارات الحسابات العامة (الموجودة مسبقاً - تأتي تحت مسار الـ login)
// ==========================================

router.get("/", async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});



//=====================================//
// تأكد من تحديث هذا المسار في نهاية ملف users.route.ts ليطابق هذا التنسيق:
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID format" });

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        miningSessions: true,
        withdrawals: true,
        socialTasks: true,
        dailyBonuses: true
      } as any
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    
    // إرجاع البيانات مهيأة للـ React
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "Server error fetching user" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { email, walletAddress, referralCode } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ message: "Email already exists" });

    if (walletAddress) {
      if (!isValidSolanaAddress(walletAddress)) {
        return res.status(400).json({ message: "Invalid Solana wallet format" });
      }
      const existingWallet = await prisma.user.findUnique({ where: { walletAddress } });
      if (existingWallet) return res.status(409).json({ message: "Wallet already exists" });
    }

    const referrer = referralCode ? await prisma.user.findUnique({ where: { referralCode } }) : null;
    const newReferralCode = await generateUniqueReferralCode();

    const user = await prisma.user.create({
      data: {
        email,
        walletAddress: walletAddress || null,
        referralCode: newReferralCode,
        referrerId: referrer?.id || null,
        currentLevel: 1,
        currentXp: 0,
        balance: 0.0,
      } as any,
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to create user" });
  }
});

// ==========================================
// ⛏️ مسارات عداد التعدين الرئيسي (Mining Endpoints)
// ==========================================

// 1. جلب حالة العداد، الوقت المتبقي، والأرباح اللحظية بدقة وأمان
router.get("/mining-status", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج المعرف بأمان عالي من التوكن لمنع التزوير
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // البحث عن أحدث جلسة تعدين نشطة
    const activeSession = await (prisma as any).miningSession.findFirst({
      where: { userId, status: "active" },
      orderBy: { startedAt: "desc" }
    });

    const userLevel = (user as any).currentLevel || 1;
    const currentRate = MINING_RATES[userLevel] || 0.5;

    // إذا لم تكن هناك جلسة نشطة، نعيد وضع التوقف
    if (!activeSession) {
      return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
    }

    const now = new Date();
    
    // إذا انتهت دورة الـ 24 ساعة، نغلقها ونضيف الأرباح لحساب المستخدم نهائياً
    if (now >= activeSession.endsAt) {
      const minedAmount = 24 * currentRate;
      await prisma.$transaction([
        (prisma as any).miningSession.update({
          where: { id: activeSession.id },
          data: { status: "completed", minedAmount }
        }),
        prisma.user.update({
          where: { id: userId },
          data: { balance: { increment: minedAmount } } as any
        })
      ]);
      return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
    }

    // ⭐ حساب كم ثانية مرت منذ بداية جلسة التعدين الحالية حتى هذه اللحظة
    const secondsPassed = Math.floor((now.getTime() - activeSession.startedAt.getTime()) / 1000);
    
    // تحويل الثواني إلى ساعات وضربها في معدل التعدين لمعرفة الأرباح المعلقة والمستحقة بدقة
    const pendingMinedAmount = (secondsPassed * currentRate) / 3600;
    const timeLeftSeconds = Math.max(0, Math.floor((activeSession.endsAt.getTime() - now.getTime()) / 1000));
    
    return res.json({
      status: "active",
      miningRate: currentRate,
      timeLeft: timeLeftSeconds,
      endsAt: activeSession.endsAt,
      pendingMinedAmount: pendingMinedAmount // إرسال الأرباح اللحظية الآمنة للواجهة الأمامية
    });
  } catch (error) {
    console.error("Mining status error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// 2. تفعيل وتشغيل العداد التنازلي لدورة تعدين جديدة (24 ساعة)
router.post("/mining-start", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج معرّف المستخدم الموثق برمجياً
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // التحقق من عدم وجود جلسة تعدين نشطة تعمل بالفعل حالياً
    const activeSession = await (prisma as any).miningSession.findFirst({
      where: { userId, status: "active" }
    });

    if (activeSession && new Date() < activeSession.endsAt) {
      return res.status(400).json({ message: "Mining session is already running and active" });
    }

    const currentLevel = (user as any).currentLevel || 1;
    const currentRate = MINING_RATES[currentLevel] || 0.5;
    
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000); // إضافة 24 ساعة بدقة كاملة

    const session = await (prisma as any).miningSession.create({
      data: { 
        userId, 
        miningRate: currentRate, 
        startedAt, 
        endsAt, 
        status: "active" 
      }
    });

    return res.status(201).json({ message: "Mining session initiated successfully", session });
  } catch (error) {
    console.error("Mining start error:", error);
    return res.status(500).json({ message: "Failed to initiate mining session" });
  }
});

// ==========================================
// 💸 2. مسارات سحب الأرباح والسجلات (Solana Network)
// ==========================================

// مخطط التحقق الحصري لعمليات السحب المالي لمنع البيانات الخبيثة
const withdrawSchema = z.object({
  amount: z.number().positive("الكمية المراد سحبها يجب أن تكون رقماً موجباً!"),
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "صيغة محفظة السحب غير سليمة برمجياً!"),
});

// أ. طلب سحب جديد وتأكيد العنوان
router.post("/withdraw", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج المعرف الآمن من التوكن العسكري المشفر
    
    // فحص المدخلات بـ Zod وتطهيرها فوراً
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { amount, walletAddress } = parsed.data;
    const MIN_WITHDRAW = 10;
    const GAS_FEE = 0.000005; // رسوم شبكة سولانا الافتراضية

    // جلب بيانات العميل وفحص رصيده الحالي في السيرفر
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || Number((user as any).balance || 0) < amount) {
      return res.status(400).json({ message: "عذراً، رصيدك الحالي غير كافٍ لإتمام عملية السحب!" });
    }

    if (amount < MIN_WITHDRAW) {
      return res.status(400).json({ message: `الحد الأدنى المسموح به للسحب هو ${MIN_WITHDRAW} عملة!` });
    }

    // خصم الرصيد وتسجيل العملية كطلب معلق في عملية معالجة موحدة (Prisma Transaction)
    const tx = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: amount } } as any
      }),
      (prisma as any).withdrawal.create({
        data: { 
          userId, 
          amount, 
          walletAddress, 
          gasFee: GAS_FEE, 
          status: "pending" // (ستظهر باللون البرتقالي 🟠 قيد الانتظار للمدير والمستخدم)
        }
      })
    ]);

    return res.status(201).json({ message: "تم تقديم طلب السحب بنجاح وهي قيد المعالجة (🟠 Pending)", data: tx[1] });
  } catch (error) {
    console.error("Withdrawal error:", error);
    return res.status(500).json({ message: "Failed to process withdrawal request safely" });
  }
});

// ب. جلب سجل السحوبات والتاريخ والحالة للمستخدم الحالي
router.get("/withdraw-history", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج المعرف الموثق برمجياً
    
    const history = await (prisma as any).withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" } // ترتيب من الأحدث للأقدم
    });
    
    return res.json(history);
  } catch (error) {
    console.error("Fetch history error:", error);
    return res.status(500).json({ message: "Failed to fetch withdrawal history" });
  }
});
/// ==========================================

// ==========================================
// 🔗 3. مسار شبكة الإحالة وقائمة الأعضاء المطور (Affiliate System)
// ==========================================

router.get("/referral-network", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج معرف المستخدم بأمان مطلق من التوكن المشفر

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        referrals: {
          include: {
            payments: true // جلب السجلات المالية للأعضاء المسجلين من خلاله للتحقق من التفعيل
          }
        }
      }
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    let totalEarnedFromReferrals = 0;

    // معالجة البيانات وإخفاء الإيميل لحماية الخصوصية، وحساب الأرباح الحقيقية لكل عضو
    const processedList = user.referrals.map((ref: any) => {
      if (!ref.email || !ref.email.includes("@")) {
        return {
          id: ref.id,
          email: "u***@solkit.com",
          joinDate: ref.createdAt,
          status: "غير مفعل ⏳",
          bonusEarned: 0.00
        };
      }

      const parts = ref.email.split("@");
      const maskedEmail = parts[0].substring(0, 2) + "***@" + parts[1];
      
      // التحقق مما إذا كان العضو قد دفع رسوم التفعيل بالكامل (Paid)
      const isPaidUser = ref.payments.some((p: any) => p.status === "paid");
      
      // قانون التفعيل الذكي: إذا كان العضو مفعلاً ودفع، يحصل الداعي على 1 دولار فوراً
      const bonusFromThisUser = isPaidUser ? 1.00 : 0.00;
      totalEarnedFromReferrals += bonusFromThisUser;

      return {
        id: ref.id,
        email: maskedEmail,
        joinDate: ref.createdAt,
        status: isPaidUser ? "مفعل ✅" : "غير مفعل ⏳",
        bonusEarned: bonusFromThisUser
      };
    });

    return res.json({
      referralCode: user.referralCode,
      totalReferrals: processedList.length,
      activeReferrals: processedList.filter(r => r.status === "مفعل ✅").length,
      totalReferralEarnings: totalEarnedFromReferrals, // إجمالي أرباح الإحالات المكتسبة بالدولار
      referralList: processedList
    });
  } catch (error) {
    console.error("Referral network fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch secure referral data" });
  }
});

// ==========================================
// 🎁 4. مسار هدايا الاشتراك والمهمات الاجتماعية (Secure Tasks)
// ==========================================

const taskVerifySchema = z.object({
  taskName: z.enum(["telegram_join", "x_follow"], { required_error: "نوع المهمة الاجتماعية مطلوب!" }),
  socialUsername: z.string().min(2, "اسم حساب التواصل الاجتماعي غير صالح!").max(100),
});

router.post("/verify-task", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج الهوية الموثقة بالـ JWT
    
    // فحص سلامة وتنظيف البيانات لمنع ثغرات الحقن والتلاعب
    const parsed = taskVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const { taskName, socialUsername } = parsed.data;
    const TASK_REWARD = 10.0;

    // التحقق الفوري ما إذا كان هذا المستخدم قد حصل على هدية هذه المهمة مسبقاً بقفل حديدي
    const existingTask = await (prisma as any).socialTask.findFirst({
      where: { userId, taskName, isCompleted: true }
    });

    if (existingTask) {
      return res.status(400).json({ message: "عذراً، لقد قمت بالمطالبة بمكافأة هذه المهمة سابقاً وحسابك مقفل لها!" });
    }

    // إضافة الجائزة للرصيد وتسجيل المهمة كمكتملة في معاملة موحدة آمنة
    await prisma.$transaction([
      (prisma as any).socialTask.create({
        data: { userId, taskName, socialUsername, isCompleted: true, rewardClaimed: TASK_REWARD }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: TASK_REWARD } } as any
      })
    ]);

    return res.json({ message: `تم التحقق بنجاح من مهمة ${taskName}! وأُضيفت +${TASK_REWARD} عملة لرصيدك.` });
  } catch (error) {
    console.error("Task verification failed:", error);
    return res.status(500).json({ message: "Task verification failed safely" });
  }
});

// ==========================================
// 📅 5. مسار البونص اليومي ومستويات الحساب (Secure Daily Streak)
// ==========================================

router.post("/claim-daily", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id; // 🛡️ استخراج الهوية الموثقة والمحمية
    const now = new Date();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // استدعاء آخر مطالبة حضور يومي قام بها المستخدم
    const lastClaim = await (prisma as any).dailyBonus.findFirst({
      where: { userId },
      orderBy: { claimedAt: "desc" }
    });

    let currentStreak = 1;
    if (lastClaim) {
      const hoursDiff = (now.getTime() - lastClaim.claimedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        return res.status(400).json({ message: "عذراً، لقد قمت بالمطالبة بالبونص اليومي الخاص بك بالفعل، يرجى العودة غداً!" });
      } else if (hoursDiff >= 24 && hoursDiff < 48) {
        // إذا حضر في اليوم التالي مباشرة، تزيد السلسلة حتى اليوم السابع ثم تعود لـ 1
        currentStreak = lastClaim.streakDay >= 7 ? 1 : lastClaim.streakDay + 1;
      } else {
        // إذا غاب وتخطى 48 ساعة، تتم إعادة تصفير السلسلة لليوم الأول تلقائياً لضمان الولاء
        currentStreak = 1;
      }
    }

    const baseReward = DAILY_REWARDS[currentStreak - 1];
    
    // حساب مضاعف الأرباح بناءً على مستوى حساب المستخدم الحالي (Tiers)
    const multiplier = user.currentLevel === 2 ? 1.05 : user.currentLevel === 3 ? 1.10 : 1.0;
    const finalReward = baseReward * multiplier;

    // حساب النظام المتصاعد للمستويات (XP Progress)
    let newXp = (user.currentXp || 0) + XP_PER_CLAIM;
    let newLevel = user.currentLevel || 1;

    if (newXp >= XP_FOR_NEXT_LEVEL) {
      newXp -= XP_FOR_NEXT_LEVEL;
      newLevel += 1; // ترقية المستوى التلقائي لزيادة سرعة التعدين والبونص الإضافي مستقبلاً
    }

    // تسجيل البونص وتحديث رصيد ومستوى المستخدم والـ XP
    await prisma.$transaction([
      (prisma as any).dailyBonus.create({
        data: { userId, streakDay: currentStreak, rewardAmount: finalReward, claimedAt: now }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { 
          balance: { increment: finalReward }, 
          currentXp: newXp, 
          currentLevel: newLevel 
        } as any
      })
    ]);

    return res.json({
      message: `تمت المطالبة ببونص اليوم ${currentStreak} بنجاح!`,
      reward: finalReward,
      currentLevel: newLevel,
      xpProgress: `${newXp}/${XP_FOR_NEXT_LEVEL}`
    });
  } catch (error) {
    console.error("Daily bonus claim failed:", error);
    return res.status(500).json({ message: "Failed to claim daily bonus safely" });
  }
});

// 📌 مسار الملاحة الفرعي العام لجلب معلومات الحساب المنفصلة (يُترك دائماً في السطر الأخير للملف)
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

    const user = await prisma.user.findUnique({
      where: { id },
      include: { socialTasks: true, dailyBonuses: true }
    } as any);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});




// ==========================================
// 👑 مسارات لوحة إدارة الموقع العليا (Secured Admin Endpoints)
// ==========================================

// 1. جلب إحصائيات النظام العامة والمالية للمدير (محمي بمطابقة المحفظة والتوكن)
router.get("/admin/stats", authenticateJWT, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    
    // حساب عدد المعدنين النشطين الذين يمتلكون جلسة تعدين سارية حالياً
    const activeMiners = await (prisma as any).miningSession.count({ 
      where: { status: "active" } 
    });
    
    // حساب طلبات السحب التي تنتظر قرار المدير
    const pendingWithdrawals = await (prisma as any).withdrawal.count({ 
      where: { status: "pending" } 
    });
    
    // حساب إجمالي الأموال المدفوعة للتفعيل تلقائياً (كل مستخدم سجل يمنح الموقع 2$)
    const totalRevenue = totalUsers * 2; 

    return res.json({
      totalUsers,
      activeMiners,
      pendingWithdrawals,
      totalRevenue
    });
  } catch (error) {
    console.error("Admin stats fetch error:", error);
    return res.status(500).json({ message: "Internal server error fetching admin stats" });
  }
});

// 2. جلب قائمة طلبات سحب سولانا المعلقة (🟠 Pending) لمراجعتها يدوياً من المدير
router.get("/admin/pending-withdrawals", authenticateJWT, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const pendingList = await (prisma as any).withdrawal.findMany({
      where: { status: "pending" },
      include: { 
        user: {
          select: { email: true, walletAddress: true } // جلب إيميل ومحفظة العميل للتحقق الفردي
        } 
      },
      orderBy: { createdAt: "desc" }
    });
    
    return res.json(pendingList);
  } catch (error) {
    console.error("Admin pending list fetch error:", error);
    return res.status(500).json({ message: "Internal server error fetching pending withdrawals" });
  }
});

// 3. اتخاذ القرار ومعالجة طلب السحب (تأكيد برقم معاملة Solana الفعلي أو رفضه وإرجاع الأموال)
router.post("/admin/process-withdrawal/:id", authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const withdrawalId = Number(req.params.id);
    const { status, txHash } = req.body; // الحالات الصارمة المقبولة: 'completed' أو 'failed'

    if (isNaN(withdrawalId)) {
      return res.status(400).json({ message: "صيغة معرّف الطلب الممررة غير سليمة" });
    }

    if (!["completed", "failed"].includes(status)) {
      return res.status(400).json({ message: "حالة التحديث الممررة غير مدعومة في النظام" });
    }

    // إذا وافق المدير (completed)، يجب التأكد برمجياً من إدخال رمز البلوكشين (Signature) للتوثيق
    if (status === "completed" && (!txHash || txHash.trim() === "")) {
      return res.status(400).json({ message: "يجب إدخال الـ Transaction Signature لتأكيد السحب على الشبكة!" });
    }

    // تحديث حالة السحب المالي في الـ MySQL
    const updatedWithdrawal = await (prisma as any).withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status,
        txHash: status === "completed" ? txHash : null
      }
    });

    // 💡 ميزة حماية إضافية: إذا رفض المدير الطلب (failed)، نقوم بإعادة العملات المستقطعة تلقائياً لرصيد العميل
    if (status === "failed") {
      await prisma.user.update({
        where: { id: updatedWithdrawal.userId },
        data: { balance: { increment: updatedWithdrawal.amount } } as any
      });
    }

    return res.json({ 
      message: `تم تحديث حالة المعاملة بنجاح إلى ${status === "completed" ? "مكتمل 🟢" : "مرفوض 🔴"}`, 
      data: updatedWithdrawal 
    });
  } catch (error) {
    console.error("Admin process withdrawal error:", error);
    return res.status(500).json({ message: "Failed to update withdrawal transaction status" });
  }
});

export default router;
