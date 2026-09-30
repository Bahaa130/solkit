// backend/src/modules/users/economyScenario.ts
// 🎯 سيناريو الاقتصاد المُحسوب — مصدر واحد للقيم (يستخدمه الـ endpoint ولوحة المدير)
//
// 📐 معادلة الاشتقاق (لا تغيّر الأرقام عشوائياً):
//   ميزانية الأنشطة      = tokenSupply × 30%
//   إصدار يومي مسموح     = ميزانية الأنشطة ÷ مدة المشروع (24 شهراً = 730 يوماً)
//   لكل مستخدم نشط       = تعدين مرجّح + (بونص × مضاعف المستوى) + العجلة + الألعاب
//   التوزيع المستخدم في النموذج: 40% L1 … 1% L9 (متوسط معدّل التعدين 2.09 توكن/يوم)
//
// ✅ النتيجة عند 5,000 مستخدم نشط: 4.37 توكن/مستخدم/يوم ⇒ 85.8% من ميزانية 30% خلال 24 شهراً
//    (تُستهلك الميزانية فعلياً حسب عدد المستخدمين الفعليين، لا حسب النماذج)

/** نقاط XP موحّدة لكل المستويات: xpTask=0 يعني «بلا مهام» بشكل صريح. */
const XP = { xpLogin: 10, xpTask: 0, xpGame: 5, xpRef: 60, xpMine: 30, xpBonus: 15 };

export interface EconomyScenario {
  id: string;
  name: string;
  desc: string;
  /** القيم المرسلة إلى updateSettings */
  payload: Record<string, unknown>;
  /** أرقام مختصرة للعرض في اللوحة */
  summary: Array<{ label: string; value: string }>;
}

export const ECONOMY_SCENARIO: EconomyScenario = {
  id: "sol62",
  name: "62M · أنشطة 30% · بلا مهام",
  desc:
    "عرض 62,000,000 توكن. 30% (18,600,000) لأنشطة المستخدمين: التعدين + العجلة + البونص فقط — بلا المهام. " +
    "مُعاير على 5,000 مستخدم نشط (≈4.37 توكن/يوم لكل مستخدم) ⇒ يستهلك ≈86% من ميزانية الأنشطة خلال 24 شهراً.",
  summary: [
    { label: "🏦 العرض", value: "62,000,000" },
    { label: "🎯 ميزانية الأنشطة", value: "18,600,000 (30%)" },
    { label: "⛏️ تعدين L1 → L9", value: "0.068 → 0.194 /ساعة" },
    { label: "⛏️ متوسط التعدين", value: "2.09 /يوم" },
    { label: "🎁 XP المهام", value: "0 (معطّل)" },
    { label: "🎰 العجلة", value: "0.53 /يوم (3 لفات)" },
    { label: "🎮 الألعاب", value: "0.90 /يوم (سقف)" },
    { label: "📊 الإجمالي/مستخدم", value: "4.37 توكن/يوم" },
  ],
  payload: {
    // 🏦 العرض الكلي
    tokenSupply: 62_000_000,
    // ⛏️ خطة المستويات: miningRate بتوكن/ساعة (يوم = ×24)
    levelPlan: [
      { level: 1, name: "Beginner", minXp: 0, color: "#94a3b8", miningRate: 0.068, ...XP },
      { level: 2, name: "Beginner+", minXp: 200, color: "#4ade80", miningRate: 0.077, ...XP },
      { level: 3, name: "Active", minXp: 550, color: "#22d3ee", miningRate: 0.087, ...XP },
      { level: 4, name: "Advanced", minXp: 1050, color: "#3b82f6", miningRate: 0.099, ...XP },
      { level: 5, name: "Professional", minXp: 1750, color: "#a855f7", miningRate: 0.114, ...XP },
      { level: 6, name: "Expert", minXp: 2700, color: "#ec4899", miningRate: 0.130, ...XP },
      { level: 7, name: "Legendary", minXp: 3900, color: "#f59e0b", miningRate: 0.149, ...XP },
      { level: 8, name: "Prestige", minXp: 5400, color: "#ef4444", miningRate: 0.170, ...XP },
      { level: 9, name: "Summit", minXp: 7200, color: "#fde047", miningRate: 0.194, ...XP },
    ],
    // 🎯 نقاط XP العامة (xpTask=0 معطّل ولا يعود للافتراضي 25)
    ...XP,
    // 📅 البونص: متوسط 0.807 توكن/يوم (المستوى 9 = ×1.24)
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
    // 🎮 الألعاب: سقف 0.5 (XO) + 0.4 (اصطياد) = 0.9 توكن/يوم
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
    // 💼 اقتصاديات العرض (المجموع 100%)
    tokenomics: [
      { label: "Mining & Activities", pct: 30, color: "#00ffcc" },
      { label: "Liquidity", pct: 25, color: "#7c5cff" },
      { label: "ICO", pct: 15, color: "#ffb020" },
      { label: "Team & Advisors", pct: 12, color: "#ff5c7a" },
      { label: "Marketing & Community", pct: 10, color: "#22c55e" },
      { label: "Operations Treasury", pct: 8, color: "#0ea5e9" },
    ],
    // 🎴 بطاقات الدخل: أقصى مجموع 0.0375/ساعة لكل مستخدم يمتلكها كلها
    cards: [
      { key: "ads_influencer", icon: "🤳", label: "Influencer Marketing", color: "#f43f5e", baseCost: 3, costGrowth: 1.2, reward: 0.002, maxLevel: 20, duration: 1 },
      { key: "ads_video", icon: "🎬", label: "Promotional Video", color: "#8b5cf6", baseCost: 5, costGrowth: 1.22, reward: 0.0035, maxLevel: 15, duration: 1 },
      { key: "ads_banner", icon: "🖼️", label: "Banner Ads", color: "#0ea5e9", baseCost: 8, costGrowth: 1.24, reward: 0.005, maxLevel: 12, duration: 2 },
      { key: "ads_telegram", icon: "📣", label: "Telegram Channels", color: "#22c55e", baseCost: 11, costGrowth: 1.26, reward: 0.007, maxLevel: 10, duration: 2 },
      { key: "ads_coupons", icon: "🎟️", label: "Discount Coupons", color: "#f59e0b", baseCost: 14, costGrowth: 1.28, reward: 0.009, maxLevel: 8, duration: 3 },
      { key: "ads_tv", icon: "📺", label: "TV Advertisement", color: "#ef4444", baseCost: 17, costGrowth: 1.3, reward: 0.011, maxLevel: 6, duration: 4 },
    ],
  },
};

/** Channels التي يوقّفها السيناريو (المهام) — لا تُحذف، تُعطَّل فقط. */
export const SCENARIO_STOPS_TASKS = true;
