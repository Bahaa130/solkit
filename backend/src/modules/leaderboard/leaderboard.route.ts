// backend/src/modules/leaderboard/leaderboard.route.ts
import { Router, Response, Request } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticateJWT, AuthenticatedRequest } from "../../middlewares/auth.middleware.js";

const router = Router();

// ==========================================
// 🏆 1. أعلى المستخدمين حسب XP والمستوى
// ==========================================
router.get("/xp", async (_req: Request, res: Response) => {
  try {
    const leaderboard = await prisma.user.findMany({
      where: { activationStatus: "active" },
      orderBy: { currentXp: "desc" },
      take: 100,
      select: {
        id: true,
        walletAddress: true,
        currentLevel: true,
        currentXp: true,
      },
    });
    return res.json(leaderboard);
  } catch (error: any) {
    console.error("GET /leaderboard/xp error:", error);
    return res.status(500).json({ message: "Error fetching XP leaderboard" });
  }
});

// ==========================================
// ⛏️ 2. أعلى المعدنين حسب مجموع التعدين
// ==========================================
router.get("/miners", async (_req: Request, res: Response) => {
  try {
    // تجميع التعدين لكل مستخدم من الجلسات المكتملة
    const topMiners = await prisma.miningSession.groupBy({
      by: ["userId"],
      where: { status: "completed" },
      _sum: { minedAmount: true },
      _count: { id: true }, // عدد الجلسات
      orderBy: { _sum: { minedAmount: "desc" } },
      take: 100,
    });

    // جلب بيانات المستخدمين
    const userIds = topMiners.map(m => m.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, walletAddress: true, currentLevel: true },
    });

    // دمج البيانات
    const leaderboard = topMiners.map(m => {
      const user = users.find(u => u.id === m.userId);
      return {
        id: m.userId,
        walletAddress: user?.walletAddress || null,
        currentLevel: user?.currentLevel || 1,
        totalMined: Number(m._sum.minedAmount || 0),
        sessionsCount: m._count.id,
      };
    });

    return res.json(leaderboard);
  } catch (error: any) {
    console.error("GET /leaderboard/miners error:", error);
    return res.status(500).json({ message: "Error fetching miners leaderboard" });
  }
});

// ==========================================
// 👥 3. أعلى المحيلين حسب الإحالات النشطة
// ==========================================
router.get("/referrers", async (_req: Request, res: Response) => {
  try {
    // جلب المستخدمين مع عدد الإحالات النشطة
    const topReferrers = await prisma.user.findMany({
      where: { activationStatus: "active" },
      select: {
        id: true,
        walletAddress: true,
        currentLevel: true,
        referralCode: true,
        _count: {
          select: {
            referrals: {
              where: { activationStatus: "active" }
            }
          }
        },
      },
      orderBy: {
        referrals: { _count: "desc" }
      },
      take: 100,
    });

    const leaderboard = topReferrers.map(u => ({
      id: u.id,
      walletAddress: u.walletAddress,
      currentLevel: u.currentLevel,
      referralsCount: u._count.referrals,
    }));

    return res.json(leaderboard);
  } catch (error: any) {
    console.error("GET /leaderboard/referrers error:", error);
    return res.status(500).json({ message: "Error fetching referrers leaderboard" });
  }
});

// ==========================================
// 🎮 4. أعلى اللاعبين حسب أرباح الألعاب
// ==========================================
router.get("/games", async (_req: Request, res: Response) => {
  try {
    const topGamers = await prisma.gameProgress.findMany({
      orderBy: { totalEarned: "desc" },
      take: 100,
      select: {
        userId: true,
        gameLevel: true,
        totalEarned: true,
        playsCount: true,
        user: {
          select: { walletAddress: true, currentLevel: true }
        },
      },
    });

    const leaderboard = topGamers.map(g => ({
      id: g.userId,
      walletAddress: g.user?.walletAddress || null,
      currentLevel: g.user?.currentLevel || 1,
      gameLevel: g.gameLevel,
      totalEarned: Number(g.totalEarned),
      playsCount: g.playsCount,
    }));

    return res.json(leaderboard);
  } catch (error: any) {
    console.error("GET /leaderboard/games error:", error);
    return res.status(500).json({ message: "Error fetching games leaderboard" });
  }
});

// ==========================================
// 📍 5. ترتيب المستخدم الحالي في كل التصنيفات
// ==========================================
router.get("/me", authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // 1. ترتيب XP
    const xpRank = await prisma.user.count({
      where: {
        activationStatus: "active",
        currentXp: { gt: (await prisma.user.findUnique({ where: { id: userId }, select: { currentXp: true } }))?.currentXp || 0 }
      }
    });

    // 2. ترتيب التعدين
    const userMining = await prisma.miningSession.aggregate({
      where: { userId, status: "completed" },
      _sum: { minedAmount: true },
    });
    const userTotalMined = Number(userMining._sum.minedAmount || 0);

    // حساب الترتيب بناءً على مجموع التعدين
    const allMiners = await prisma.miningSession.groupBy({
      by: ["userId"],
      where: { status: "completed" },
      _sum: { minedAmount: true },
    });
    const miningRank = allMiners
      .sort((a, b) => Number(b._sum.minedAmount || 0) - Number(a._sum.minedAmount || 0))
      .findIndex(m => m.userId === userId) + 1 || null;

    // 3. ترتيب الإحالات
    const userReferralsCount = await prisma.user.count({
      where: { referrerId: userId, activationStatus: "active" }
    });
    const referrersRank = await prisma.user.count({
      where: {
        activationStatus: "active",
        referrals: {
          some: { activationStatus: "active" }
        }
      }
    }) + 1; // تقدير تقريبي

    // 4. ترتيب الألعاب
    const userGameProgress = await prisma.gameProgress.findUnique({
      where: { userId },
      select: { totalEarned: true }
    });
    const userTotalEarned = Number(userGameProgress?.totalEarned || 0);
    const gamesRank = await prisma.gameProgress.count({
      where: { totalEarned: { gt: userTotalEarned } }
    });

    return res.json({
      xp: { rank: xpRank + 1, value: (await prisma.user.findUnique({ where: { id: userId }, select: { currentXp: true } }))?.currentXp || 0 },
      mining: { rank: miningRank, value: userTotalMined },
      referrals: { rank: referrersRank, value: userReferralsCount },
      games: { rank: gamesRank + 1, value: userTotalEarned },
    });
  } catch (error: any) {
    console.error("GET /leaderboard/me error:", error);
    return res.status(500).json({ message: "Error fetching user rankings" });
  }
});

export default router;
