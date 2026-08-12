// backend/src/modules/games/games.route.ts
// 🎮 مسارات الألعاب المصغرة والمستوى الموحد — السيرفر هو السلطة (لا يُصدَّق العميل)
import { Router, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticateJWT, AuthenticatedRequest } from "../../middlewares/auth.middleware.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_SOLKIT_KEY_2026";

// ==========================================
// ⚙️ الإعدادات القابلة للضبط (في مكان واحد)
// ==========================================

// 🎰 قيم شرائح العجلة الثابتة عند السيرفر — النتيجة النهائية لا تأتي من العميل إطلاقاً
const WHEEL_SEGMENTS = [1.0, 2.0, 0.5, 3.0, 1.5, 0.5, 10.0, 1.0]; // فهرس 6 = الجائزة الكبرى 10

const XP_PER_PLAY = 10; // نقاط خبرة المستوى الموحد لكل جولة ممنوحة
const TOTAL_DAILY_CAP = 150; // السقف الإجمالي اليومي لجميع الألعاب معاً

type GameKey = "wheel" | "tap" | "catch";

// cooldownSec: ثوانٍ بين جولتين (ساعة كاملة لزيارة مستمرة للموقع) • dailyCap: سقف يومي بالمبلغ الممنوح فعلياً • maxScore: حد أقصى معقول
const HOUR_LOCK = 3600; // ⏳ قفل الساعة — كل لعبة مرة واحدة كل ساعة
const GAME_CONFIG: Record<GameKey, { cooldownSec: number; dailyCap: number; maxScore: number | null }> = {
  wheel: { cooldownSec: HOUR_LOCK, dailyCap: 50, maxScore: null }, // العجلة تستخدم شريحة وليس score
  tap: { cooldownSec: HOUR_LOCK, dailyCap: 100, maxScore: 45 },
  catch: { cooldownSec: HOUR_LOCK, dailyCap: 80, maxScore: 45 },
};

// 🕐 تنسيق مدة القفل بالعربية (ساعة/دقيقة/ثانية)
const fmtLock = (sec: number): string => {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.ceil((sec % 3600) / 60);
    return m > 0 ? `${h} ساعة و ${m} دقيقة` : `${h} ساعة`;
  }
  if (sec >= 60) return `${Math.ceil(sec / 60)} دقيقة`;
  return `${sec} ثانية`;
};

// ⚡ مضاعف موحد متدرج بمستوى اللعبة — ينطبق على أرباح الألعاب فقط (L1=1.00, L2=1.15, L3=1.30 … سقف 5x)
const getGameMultiplier = (level: number): number => Math.min(5, 1 + (Math.max(1, level) - 1) * 0.15);

// تقريب إلى 8 خانات عشرية (نمط Decimal(18,8))
const round8 = (n: number): number => Math.round(n * 1e8) / 1e8;

const resultSchema = z.object({
  game: z.enum(["wheel", "tap", "catch"]),
  score: z.number().int().min(0).optional(),
  segment: z.number().int().min(0).max(7).optional(),
  spinToken: z.string().optional(),
});

// ==========================================
// 📊 1. حالة اللاعب الموحدة
// ==========================================
router.get("/status", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "الحساب غير موجود" });

    let progress = await (prisma as any).gameProgress.findUnique({ where: { userId } });
    if (!progress) {
      progress = await (prisma as any).gameProgress.create({ data: { userId } });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayEarned: Record<GameKey, number> = { wheel: 0, tap: 0, catch: 0 };
    const cooldowns: Record<GameKey, number> = { wheel: 0, tap: 0, catch: 0 };
    const games: GameKey[] = ["wheel", "tap", "catch"];

    for (const g of games) {
      const [agg, last] = await Promise.all([
        (prisma as any).gamePlayRecord.aggregate({
          _sum: { reward: true },
          where: { userId, game: g, createdAt: { gte: startOfDay } },
        }),
        (prisma as any).gamePlayRecord.findFirst({
          where: { userId, game: g },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      todayEarned[g] = Number(agg._sum?.reward || 0);
      if (last) {
        const elapsed = (Date.now() - new Date(last.createdAt).getTime()) / 1000;
        cooldowns[g] = Math.max(0, Math.ceil(GAME_CONFIG[g].cooldownSec - elapsed));
      }
    }

    const gameLevel = progress.gameLevel || 1;
    return res.json({
      gameLevel,
      gameXp: progress.gameXp || 0,
      xpForNext: progress.xpForNext || 100,
      multiplier: getGameMultiplier(gameLevel),
      totalEarned: Number(progress.totalEarned || 0),
      playsCount: progress.playsCount || 0,
      balance: Number(user.balance),
      eligible: user.activationStatus === "active",
      todayEarned: { ...todayEarned, total: todayEarned.wheel + todayEarned.tap + todayEarned.catch },
      dailyCaps: {
        wheel: GAME_CONFIG.wheel.dailyCap,
        tap: GAME_CONFIG.tap.dailyCap,
        catch: GAME_CONFIG.catch.dailyCap,
        total: TOTAL_DAILY_CAP,
      },
      cooldowns,
    });
  } catch {
    return res.status(500).json({ message: "خطأ في جلب حالة الألعاب" });
  }
});

// ==========================================
// 🎰 2. دوران العجلة — السيرفر يختار النتيجة حصرياً
// ==========================================
router.post("/wheel/spin", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.activationStatus !== "active") return res.status(403).json({ message: "الحساب غير مفعّل" });

    const segment = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    // توكن موقع قصير الأمد يربط النتيجة بالمستخدم — لا يمكن للعميل تزويرها
    const spinToken = jwt.sign({ userId, game: "wheel", segment }, JWT_SECRET, { expiresIn: "90s" });
    return res.json({ segment, spinToken });
  } catch {
    return res.status(500).json({ message: "خطأ في تدوير العجلة" });
  }
});

// ==========================================
// 💰 3. تسوية الجولة الواحدة (لكل الألعاب)
// ==========================================
router.post("/result", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = resultSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "بيانات الجولة غير صالحة" });
    const { game, score, segment, spinToken } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.activationStatus !== "active") return res.status(403).json({ message: "الحساب غير مفعّل" });

    const cfg = GAME_CONFIG[game];

    // 🎰 العجلة: تحقق من التوكن الموقّع ومطابقة النتيجة
    let base = 0;
    let scoreVal = 0;
    if (game === "wheel") {
      if (spinToken == null || segment == null) return res.status(400).json({ message: "طلب عجلة غير مكتمل" });
      let payload: any;
      try {
        payload = jwt.verify(spinToken, JWT_SECRET);
      } catch {
        return res.status(400).json({ message: "رمز الدوران غير صالح، حاول مجدداً" });
      }
      if (payload.userId !== userId || payload.game !== "wheel" || payload.segment !== segment) {
        return res.status(400).json({ message: "نتيجة غير صحيحة" });
      }
      base = WHEEL_SEGMENTS[segment];
      scoreVal = segment;
    } else {
      // 👆🪙 ألعاب المهارة: فحص حد أقصى معقول للنتيجة
      if (score == null) return res.status(400).json({ message: "النتيجة مفقودة" });
      if (cfg.maxScore != null && score > cfg.maxScore) return res.status(400).json({ message: "نتيجة غير صحيحة" });
      base = game === "tap" ? score * 0.2 : score * 0.1;
      scoreVal = score;
      // جولة صفرية (لا إصابات) لا تحسب كجولة ولا تطبق كولدون
      if (score <= 0) return res.json({ reward: 0, balance: Number(user.balance), xpGained: 0, gameLevel: 0, gameXp: 0, leveledUp: false });
    }

    // ⏱️ كولدون: من آخر جولة مسجلة لنفس اللعبة
    const last = await (prisma as any).gamePlayRecord.findFirst({
      where: { userId, game },
      orderBy: { createdAt: "desc" },
    });
    if (last) {
      const elapsed = (Date.now() - new Date(last.createdAt).getTime()) / 1000;
      if (elapsed < cfg.cooldownSec) {
        const retryAfterSec = Math.ceil(cfg.cooldownSec - elapsed);
        return res.status(429).json({ message: `⏳ زر اللعب مقفول — عد بعد ${fmtLock(retryAfterSec)} للعب مرة أخرى`, retryAfterSec });
      }
    }

    // 📅 الحدود اليومية على المبلغ الممنوح فعلياً
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [dayByGameAgg, dayTotalAgg] = await Promise.all([
      (prisma as any).gamePlayRecord.aggregate({ _sum: { reward: true }, where: { userId, game, createdAt: { gte: startOfDay } } }),
      (prisma as any).gamePlayRecord.aggregate({ _sum: { reward: true }, where: { userId, createdAt: { gte: startOfDay } } }),
    ]);
    const dayByGame = Number(dayByGameAgg._sum?.reward || 0);
    const dayTotal = Number(dayTotalAgg._sum?.reward || 0);
    const roomGame = Math.max(0, cfg.dailyCap - dayByGame);
    const roomTotal = Math.max(0, TOTAL_DAILY_CAP - dayTotal);
    if (roomGame <= 0 || roomTotal <= 0) {
      return res.status(429).json({ message: "وصلت للحد الأقصى اليومي لأرباح الألعاب ⏳ عد غداً" });
    }

    // ⚡ المضاعف + القصّ عند المساحة المتبقية
    const progress = await (prisma as any).gameProgress.findUnique({ where: { userId } });
    const gameLevel = progress?.gameLevel || 1;
    const xpForNext = progress?.xpForNext || 100;
    const multiplier = getGameMultiplier(gameLevel);
    let final = round8(base * multiplier);
    if (final > roomGame) final = roomGame;
    if (final > roomTotal) final = roomTotal;
    final = round8(final);

    // ⭐ الخبرة والترقية (حلقة while تدعم الترقية المتعددة)
    const xpGained = final > 0 ? XP_PER_PLAY : 0;
    let newLevel = gameLevel;
    let newXp = (progress?.gameXp || 0) + xpGained;
    let leveledUp = false;
    while (newXp >= xpForNext) {
      newXp -= xpForNext;
      newLevel += 1;
      leveledUp = true;
    }

    // 🔒 معاملة واحدة ذرية: رصيد + تقدم + سجل
    const [updatedUser] = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId }, data: { balance: { increment: final } } as any });
      await (tx as any).gameProgress.upsert({
        where: { userId },
        create: { userId, gameLevel: newLevel, gameXp: newXp, xpForNext, totalEarned: final, playsCount: 1 },
        update: { gameLevel: newLevel, gameXp: newXp, xpForNext, totalEarned: { increment: final }, playsCount: { increment: 1 } },
      });
      await (tx as any).gamePlayRecord.create({
        data: { userId, game, score: scoreVal, baseReward: base, multiplier, reward: final, xpGained, leveledUp },
      });
      return [u];
    });

    return res.json({
      reward: final,
      balance: Number(updatedUser.balance),
      multiplier,
      xpGained,
      gameLevel: newLevel,
      gameXp: newXp,
      xpForNext,
      leveledUp,
      todayEarned: dayByGame + final,
      capped: final < base * multiplier,
    });
  } catch {
    return res.status(500).json({ message: "فشلت معالجة الجولة" });
  }
});

// ==========================================
// 🕘 4. سجل آخر الجولات (اختياري للواجهة)
// ==========================================
router.get("/history", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const records = await (prisma as any).gamePlayRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return res.json(
      records.map((r: any) => ({
        game: r.game,
        reward: Number(r.reward),
        xpGained: r.xpGained,
        leveledUp: r.leveledUp,
        createdAt: r.createdAt,
      }))
    );
  } catch {
    return res.status(500).json({ message: "خطأ في جلب سجل الجولات" });
  }
});

export default router;
