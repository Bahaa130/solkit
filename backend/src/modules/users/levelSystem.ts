// backend/src/modules/users/levelSystem.ts
// 🎯 نظام المستويات المعتمد على النشاط — مشترك بين مسارات المستخدمين/المهام/الألعاب
import { prisma } from "../../config/prisma.js";
import { getSettings, type LevelDef, DEFAULT_ACTIVITY_XP } from "../../config/settings.js";

// 📊 أنواع فئات نقاط النشاط (تطابق مفاتيح LevelDef وأعمدة المكتسبة)
export type ActivityKey = "xpLogin" | "xpTask" | "xpGame" | "xpRef" | "xpMine" | "xpBonus";
export const ACTIVITY_KEYS: ActivityKey[] = ["xpLogin", "xpTask", "xpGame", "xpRef", "xpMine", "xpBonus"];

// 🎯 الخطة الافتراضية (9 مستويات) — يضبطها المدير لاحقاً من لوحة التحكم
export const DEFAULT_LEVEL_PLAN: LevelDef[] = [
  { level: 1, name: "المبتدئ", minXp: 0, color: "#94a3b8", miningRate: 0.50 },
  { level: 2, name: "المبتدئ+", minXp: 120, color: "#4ade80", miningRate: 0.58 },
  { level: 3, name: "النشط", minXp: 300, color: "#22d3ee", miningRate: 0.68 },
  { level: 4, name: "المتقدم", minXp: 600, color: "#3b82f6", miningRate: 0.80 },
  { level: 5, name: "المحترف", minXp: 1100, color: "#a855f7", miningRate: 0.95 },
  { level: 6, name: "الخبير", minXp: 1900, color: "#ec4899", miningRate: 1.12 },
  { level: 7, name: "الأسطوري", minXp: 3200, color: "#f59e0b", miningRate: 1.32 },
  { level: 8, name: "الفخري", minXp: 5200, color: "#ef4444", miningRate: 1.55 },
  { level: 9, name: "القمة", minXp: 8000, color: "#fde047", miningRate: 1.85 },
];

// 📖 جلب خطة المستويات الفعّالة (من إعدادات المدير أو الافتراضية)
export const getLevelPlan = (): LevelDef[] => {
  const s = getSettings();
  if (s.levelPlan && Array.isArray(s.levelPlan) && s.levelPlan.length) return s.levelPlan;
  return DEFAULT_LEVEL_PLAN;
};

// ⛏️ معدل التعدين لمستوى معيّن
export const rateForLevel = (level: number): number => {
  const plan = getLevelPlan();
  const def = plan.find((d) => d.level === level) || plan[plan.length - 1];
  return def ? Number(def.miningRate) : 0.5;
};

// 🔢 حساب رقم المستوى من رصيد النشاط (أعلى مستوى تحقق عتبته)
export const computeLevelFromXp = (xp: number): number => {
  const plan = getLevelPlan();
  let lvl = 1;
  for (const d of plan) if (xp >= Number(d.minXp)) lvl = d.level;
  return lvl;
};

// 🏅 منح نقاط نشاط لمستخدم وترقية مستواه تلقائياً حسب الخطة
// 🎯 القيمة تُقرأ حسب مستوى المستخدم الحالي (لكل مستوى نقاطه الخاصة) ويُسجَّل الكسب في فئته
export const awardActivity = async (userId: number, category: ActivityKey): Promise<number> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const points = xpForLevel(user?.currentLevel || 1, category);
  const xp = (user?.currentXp || 0) + points;
  const lvl = computeLevelFromXp(xp);
  const earnedCol = `${category}Earned` as const;
  await prisma.user.update({
    where: { id: userId },
    data: { currentXp: xp, currentLevel: lvl, [earnedCol]: { increment: points } } as any
  });
  return points;
};

// 🎯 نقاط نشاط فئة معيّنة لمستوى معيّن: قيمة المستوى ← القيمة العامة ← الافتراضي
export const xpForLevel = (level: number, category: ActivityKey): number => {
  const plan = getLevelPlan();
  const def = plan.find((d) => d.level === level);
  const fromLevel = def ? Number(def[category]) : NaN;
  if (Number.isFinite(fromLevel) && fromLevel > 0) return Math.round(fromLevel);
  const s = getSettings();
  const fromGlobal = Number((s as any)[category]);
  if (Number.isFinite(fromGlobal) && fromGlobal > 0) return Math.round(fromGlobal);
  return DEFAULT_ACTIVITY_XP[category];
};
