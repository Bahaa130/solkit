// admin-frontend/src/lib/economyPresets.ts
// 🎯 سيناريوهات اقتصاد مُحسوبة مسبقاً — يستطيع المدير تطبيق أي منها بضغطة واحدة
// ثم تعديل أي حقل كما يشاء (كل القيم تبقى قابلة للتعديل من اللوحة بعد التطبيق).
//
// 📐 معادلة الاشتقاق (مهمة — لا تغيّر الأرقام عشوائياً):
//   ميزانية الأنشطة = tokenSupply × 30%
//   إصدار يومي مسموح = ميزانية الأنشطة ÷ مدة المشروع (افتراضي 24 شهراً = 730 يوماً)
//   لكل مستخدم نشط = (تعدين مرجّح بالمستويات) + (بونص × مضاعف المستوى) + (العجلة) + (XO) + (الاصطياد)

export interface EconomyPreset {
  id: string;
  name: string;
  desc: string;
  supply: number;
  payload: Record<string, any>;
}

const XP = { xpLogin: 10, xpTask: 0, xpGame: 5, xpRef: 60, xpMine: 30, xpBonus: 15 };

// 🟢 السيناريو الرئيسي: 62 مليون عرض · 30% للأنشطة (تعدين + عجلة + بونص) · بلا مهام
const SCENARIO_62M: EconomyPreset = {
  id: "sol62",
  name: "62M · أنشطة 30% · بلا مهام",
  desc:
    "عرض 62,000,000 توكن. 30% (18,600,000) مخصّصة لأنشطة المستخدمين: التعدين + العجلة + البونص فقط — بلا المهام. " +
    "السيناريو مُعاير على 5,000 مستخدم نشط (≈4.4 توكن/يوم لكل مستخدم) ⇒ يستهلك ≈86% من الميزانية خلال 24 شهراً.",
  supply: 62_000_000,
  payload: {
    // 🏦 العرض الكلي
    tokenSupply: 62_000_000,
    // ⛏️ خطة المستويات: المعدل = توكن/ساعة (كل 24 ساعة = ×24)
    levelPlan: [
      { level: 1, name: "المبتدئ", minXp: 0, color: "#94a3b8", miningRate: 0.068, ...XP },
      { level: 2, name: "المبتدئ+", minXp: 200, color: "#4ade80", miningRate: 0.077, ...XP },
      { level: 3, name: "النشط", minXp: 550, color: "#22d3ee", miningRate: 0.087, ...XP },
      { level: 4, name: "المتقدم", minXp: 1050, color: "#3b82f6", miningRate: 0.099, ...XP },
      { level: 5, name: "المحترف", minXp: 1750, color: "#a855f7", miningRate: 0.114, ...XP },
      { level: 6, name: "الخبير", minXp: 2700, color: "#ec4899", miningRate: 0.130, ...XP },
      { level: 7, name: "الأسطوري", minXp: 3900, color: "#f59e0b", miningRate: 0.149, ...XP },
      { level: 8, name: "الفخري", minXp: 5400, color: "#ef4444", miningRate: 0.170, ...XP },
      { level: 9, name: "القمة", minXp: 7200, color: "#fde047", miningRate: 0.194, ...XP },
    ],
    // 🎯 نقاط النشاط العامة (0 = معطّل — احتراماً لاختيار «بلا مهام»)
    ...XP,
    // 📅 جدول البونص: متوسط 0.807 توكن/يوم (المستوى 9 = ×1.24)
    dailyRewards: [0.25, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4],
    dailyLevelMult: 0.03,
    miningDuration: 24,
    // 🎰 العجلة: 4 ساعات بين اللفات · 3 لفات/يوم · متوسط 0.53 توكن/يوم
    wheel: {
      segments: [
        { value: 0.05, weight: 30 },
        { value: 0.1, weight: 28 },
        { value: 0.15, weight: 20 },
        { value: 0.3, weight: 13 },
        { value: 0.6, weight: 7 },
        { value: 1.2, weight: 2 },
      ],
      cooldownSec: 14400,
      dailyCap: 3,
    },
    // 🎮 ألعاب المهارة: 0.5 + 0.4 توكن/يوم كحد أقصى لكل لعبة
    games: {
      xoWinReward: 0.15,
      xoCooldownSec: 3600,
      xoDailyCap: 0.5,
      catchCoinReward: 0.03,
      catchCooldownSec: 3600,
      catchDailyCap: 0.4,
      catchMaxScore: 80,
      totalDailyCap: 2.5,
    },
    // 💼 اقتصاديات العرض (مجموعها 100%)
    tokenomics: [
      { label: "التعدين والأنشطة", pct: 30, color: "#00ffcc" },
      { label: "السيولة", pct: 25, color: "#7c5cff" },
      { label: "الاكتتاب", pct: 15, color: "#ffb020" },
      { label: "الفريق والمستشارون", pct: 12, color: "#ff5c7a" },
      { label: "التسويق والمجتمع", pct: 10, color: "#22c55e" },
      { label: "خزينة العمليات", pct: 8, color: "#0ea5e9" },
    ],
    // 🎴 بطاقات الدخل: مجموع العائد الأقصى 0.0375/ساعة (+55% من معدل المستوى 1)
    cards: [
      { key: "ads_influencer", icon: "🤳", label: "مؤثرون للتسويق", color: "#f43f5e", baseCost: 3, costGrowth: 1.2, reward: 0.002, maxLevel: 20, duration: 1 },
      { key: "ads_video", icon: "🎬", label: "فيديو ترويجي", color: "#8b5cf6", baseCost: 5, costGrowth: 1.22, reward: 0.0035, maxLevel: 15, duration: 1 },
      { key: "ads_banner", icon: "🖼️", label: "لافتات إعلانية", color: "#0ea5e9", baseCost: 8, costGrowth: 1.24, reward: 0.005, maxLevel: 12, duration: 2 },
      { key: "ads_telegram", icon: "📣", label: "قنوات تيليجرام", color: "#22c55e", baseCost: 11, costGrowth: 1.26, reward: 0.007, maxLevel: 10, duration: 2 },
      { key: "ads_coupons", icon: "🎟️", label: "كوبونات خصم", color: "#f59e0b", baseCost: 14, costGrowth: 1.28, reward: 0.009, maxLevel: 8, duration: 3 },
      { key: "ads_tv", icon: "📺", label: "إعلان تلفزيوني", color: "#ef4444", baseCost: 17, costGrowth: 1.3, reward: 0.011, maxLevel: 6, duration: 4 },
    ],
  },
};

export const ECONOMY_PRESETS: EconomyPreset[] = [SCENARIO_62M];
export const getPreset = (id: string) => ECONOMY_PRESETS.find((p) => p.id === id);
