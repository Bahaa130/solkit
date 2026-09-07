// backend/src/config/settings.ts
// ⚙️ إعدادات الموقع العامة (الصيانة + عدّاد TGE) — محفوظة في ملف JSON على القرص
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.resolve(__dirname, "../../settings.json");

export interface SiteSettings {
  maintenanceMode: boolean;   // 🔧 وضع الصيانة (يُظهر صفحة الصيانة لجميع المستخدمين)
  maintenanceMessage: string; // 📝 رسالة الصيانة المعروضة
  tgeTarget: number;          // ⏳ هدف العدّاد التنازلي (timestamp بالميلي ثانية، 0 = غير مُعيّن)
  tokenMint: string;          // 🪙 عنوان عقد التوكن (Mint) المربوط يدوياً من لوحة المدير
  tokenDecimals: number;      // 🔢 عدد الكسور العشرية للتوكن
  solanaNetwork: string;      // 🌐 شبكة سولانا (devnet | mainnet-beta)
  treasuryWallet: string;     // 🏦 محفظة الخزانة التي تملك التوكن وتوقّع التوزيع
  projectName: string;        // 🏷️ اسم المشروع الظاهر في العنوان والهيدر (قابل للتغيير من المدير)
  tokenName: string;          // 🪙 الاسم الكامل للعملة
  tokenSymbol: string;        // 🔤 رمز العملة (مثل SOLKIT)
  tokenIcon: string;          // 🖼️ أيقونة العملة (data URL بصيغة base64) أو نص فارغ = الإيموجي الافتراضي 💎
  tokenSupply: number;        // 📊 إجمالي عرض العملة الكلي (يظهر في الورقة البيضاء)
  levelPlan: LevelDef[];      // 🎯 خطة المستويات التسعة (النشاط) — يضبطها المدير
  // ── ثوابت الأرقام التي تتحكم بها الإدارة ──
  dailyRewards: number[];             // 🎁 مكافآت البونص اليومي لكل يوم من أيام السلسلة (1..31 يوماً)
  dailyLevelMult: number;             // 📈 مضاعف مستوى المستخدم على مكافأة البونص (0.05 = +5% لكل مستوى)
  activationFullLamports: number;     // 💰 رسوم التفعيل بدون إحالة (باللامبرت — 1e9 لامبرت = 1 SOL)
  activationHalfLamports: number;     // 💰 حصة كل محفظة عند التقسيم مع إحالة (باللامبرت)
  siteShare: number;                  // 🏦 نسبة رسوم الموقع من مبلغ التفعيل عند التقسيم
  referrerShare: number;              // 🤝 حصة المحيل من مبلغ التفعيل عند التقسيم
  xpLogin: number;                    // 📊 نقاط نشاط تسجيل الدخول
  xpTask: number;                     // 📊 نقاط نشاط إكمال مهمة (بعد موافقة المدير)
  xpGame: number;                     // 📊 نقاط نشاط لعب جولة
  xpRef: number;                      // 📊 نقاط نشاط تفعيل صديق عبر الإحالة
  xpMine: number;                     // 📊 نقاط نشاط إكمال جلسة تعدين (24 ساعة)
  xpBonus: number;                    // 📊 نقاط نشاط المطالبة بالبونص اليومي
  miningDuration: number;             // ⏱️ مدة جلسة التعدين بالساعات — يضبطها المدير
  roadmap: RoadmapPhase[];            // 🗺️ مراحل خارطة الطريق (تُدار بالكامل من المدير)
  wheel: WheelSettings;               // 🎰 إعدادات عجلة الحظ (الشرائح والأوزان والسقوف)
  tokenomics: TokenomicsSplit[];      // 💼 اقتصاديات التوكن — نسب توزيع العرض الكلي (تتحكم بها الإدارة)
  cards?: CardDef[];                  // 📇 بطاقات الدخل القابلة للترقية (نموذج هامستر)
}

// 💼 شريحة واحدة في اقتصاديات التوكن (توزيع العرض الكلي)
export interface TokenomicsSplit {
  label: string;   // اسم الفئة (مثال: التعدين، الألعاب، المجتمع، الفريق)
  pct: number;     // النسبة المئوية من العرض الكلي (0..100)
  color: string;   // اللون (hex) المستخدم في الشريط والمفتاح بصفحة الإير دروب
}

// 📇 كارت دخل قابل للترقية (نموذج هامستر — تستهلك الرصيد وترفع معدل التعدين)
export interface CardDef {
  key: string;       // مفتاح فريد (مطابق لـ CardUpgrade.cardKey)
  icon: string;      // إيموجي الكارت (احتياطي)
  image?: string;    // 🖼️ رابط صورة مصغّرة مرفوعة من المدير (يغلب على الإيموجي إن وُجد) — مثال: /uploads/cards/xxx.png
  label: string;     // اسم الحملة/الإعلان
  color: string;     // لون الكارت (hex)
  baseCost: number;  // تكلفة الترقية الأولى بالنقاط (الرصيد)
  costGrowth: number; // مضاعف التكلفة لكل مستوى لاحق (مثال 1.2)
  reward: number;    // الدخل الكلي لكل مستوى (نقاط/24 ساعة) — كل مستوى يضيف هذا المقدار
  maxLevel: number;  // سقف عدد الترقيات
  duration?: number; // ⏳ مدة فترة إعادة الشحن بين الترقيات بالساعات — يضبطها المدير
}
// 🎡 شريحة واحدة في عجلة الحظ
export interface WheelSegment { value: number; weight: number }
// 🎰 إعدادات العجلة القابلة للضبط من المدير
export interface WheelSettings {
  segments: WheelSegment[];   // القيم + أوزانها (العدالة)
  cooldownSec: number;        // ثوانٍ بين جولتين
  dailyCap: number;           // سقف العجلة اليومي
}

// 🗺️ مرحلة واحدة في خارطة الطريق
export interface RoadmapPhase {
  icon: string;   // إيموجي
  label: string;  // نص المرحلة
  status: "done" | "current" | "upcoming"; // الحالة
}

// 🎯 تعريف مستوى واحد في خطة المستويات (يُدار من لوحة المدير)
export interface LevelDef {
  level: number;     // رقم المستوى (1..9)
  name: string;      // اسم/عنوان المستوى (نص يضبطه المدير)
  minXp: number;     // الحد الأدنى لرصيد النشاط للوصول لهذا المستوى
  color: string;     // لون/ثيم عداد التعدين (hex)
  miningRate: number;// معدل التعدين (SOL لكل جلسة 24 ساعة)
  // 📊 نقاط النشاط الخاصة بهذا المستوى (تتجاوز القيم العامة إن ضُبطت)
  xpLogin?: number;
  xpTask?: number;
  xpGame?: number;
  xpRef?: number;
  xpMine?: number;
  xpBonus?: number;
}

// 📊 القيم الافتراضية لنقاط النشاط (تُستخدم عند غياب قيمة المستوى أو العامة)
export const DEFAULT_ACTIVITY_XP = {
  xpLogin: 10,
  xpTask: 25,
  xpGame: 5,
  xpRef: 50,
  xpMine: 30,
  xpBonus: 15,
};

const DEFAULTS: SiteSettings = {
  maintenanceMode: false,
  maintenanceMessage: "نحن نجري صيانة مجدولة. سنعود قريباً! 🔧",
  tgeTarget: 0,
  tokenMint: "",
  tokenDecimals: 9,
  solanaNetwork: "devnet",
  treasuryWallet: "",
  projectName: "SOLKIT",
  tokenName: "SOLKIT",
  tokenSymbol: "SOLKIT",
  tokenIcon: "",
  tokenSupply: 1_000_000,
  levelPlan: [
    { level: 1, name: "المبتدئ", minXp: 0, color: "#94a3b8", miningRate: 0.50, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 2, name: "المبتدئ+", minXp: 120, color: "#4ade80", miningRate: 0.58, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 3, name: "النشط", minXp: 300, color: "#22d3ee", miningRate: 0.68, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 4, name: "المتقدم", minXp: 600, color: "#3b82f6", miningRate: 0.80, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 5, name: "المحترف", minXp: 1100, color: "#a855f7", miningRate: 0.95, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 6, name: "الخبير", minXp: 1900, color: "#ec4899", miningRate: 1.12, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 7, name: "الأسطوري", minXp: 3200, color: "#f59e0b", miningRate: 1.32, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 8, name: "الفخري", minXp: 5200, color: "#ef4444", miningRate: 1.55, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 9, name: "القمة", minXp: 8000, color: "#fde047", miningRate: 1.85, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
  ],
  dailyRewards: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0],
  dailyLevelMult: 0.05,
  activationFullLamports: 30000000,   // 0.03 SOL
  activationHalfLamports: 15000000,   // 0.015 SOL
  siteShare: 0.015,
  referrerShare: 0.015,
  xpLogin: 10,
  xpTask: 25,
  xpGame: 5,
  xpRef: 50,
  xpMine: 30,
  xpBonus: 15,
  miningDuration: 24,
  roadmap: [
    { icon: "⚙️", label: "بناء النظام الأساسي", status: "done" },
    { icon: "🔐", label: "تفعيل أمني + اختبار", status: "done" },
    { icon: "🚀", label: "إطلاق النسخة التجريبية", status: "current" },
    { icon: "🦍", label: "إطلاق النسخة الكاملة", status: "upcoming" },
    { icon: "🌐", label: "التوسع والبورصات", status: "upcoming" },
  ],
  // 🎰 عجلة الحظ الافتراضية: القيم من الأصغر للأكبر، الأوزان تجعل الجوائز الكبرى أندر
  wheel: {
    segments: [
      { value: 0.5, weight: 22 },
      { value: 1.0, weight: 20 },
      { value: 1.5, weight: 18 },
      { value: 2.0, weight: 14 },
      { value: 2.5, weight: 10 },
      { value: 3.0, weight: 8 },
      { value: 5.0, weight: 5 },
      { value: 12.0, weight: 3 },
    ],
    cooldownSec: 3600,
    dailyCap: 50,
  },
  // 💼 اقتصاديات التوكن الافتراضية: نسب توزيع العرض الكلي (تتحكم بها الإدارة من لوحة المدير)
  tokenomics: [
    { label: "التعدين", pct: 40, color: "#00ffcc" },
    { label: "الألعاب", pct: 25, color: "#7c5cff" },
    { label: "المجتمع", pct: 20, color: "#ffb020" },
    { label: "الفريق", pct: 15, color: "#ff5c7a" },
  ],
  // 📇 بطاقات الدخل الافتراضية (حملات إعلانية تُرقى بالنقاط = إيراد يضاف لمعدل التعدين)
  cards: [
    { key: "ads_influencer", icon: "🤳", label: "مؤثرون للتسويق", color: "#f43f5e", baseCost: 50, costGrowth: 1.18, reward: 0.04, maxLevel: 20, duration: 1 },
    { key: "ads_video", icon: "🎬", label: "فيديو ترويجي", color: "#8b5cf6", baseCost: 120, costGrowth: 1.2, reward: 0.08, maxLevel: 15, duration: 1 },
    { key: "ads_banner", icon: "🖼️", label: "لافتات إعلانية", color: "#0ea5e9", baseCost: 300, costGrowth: 1.22, reward: 0.16, maxLevel: 12, duration: 2 },
    { key: "ads_telegram", icon: "📣", label: "قنوات تيليجرام", color: "#22c55e", baseCost: 750, costGrowth: 1.25, reward: 0.32, maxLevel: 10, duration: 2 },
    { key: "ads_coupons", icon: "🎟️", label: "كوبونات خصم", color: "#f59e0b", baseCost: 1800, costGrowth: 1.28, reward: 0.64, maxLevel: 8, duration: 3 },
    { key: "ads_tv", icon: "📺", label: "إعلان تلفزيوني", color: "#ef4444", baseCost: 4500, costGrowth: 1.3, reward: 1.2, maxLevel: 6, duration: 4 },
  ],
};

// 📖 قراءة الإعدادات من القرص (تعيد القيم الافتراضية عند عدم وجود الملف)
let cachedSettings: SiteSettings | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5000;

export function getSettings(): SiteSettings {
  const now = Date.now();
  if (cachedSettings && now - cacheTime < CACHE_TTL_MS) {
    return cachedSettings;
  }
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
      cachedSettings = { ...DEFAULTS, ...JSON.parse(raw) };
    } else {
      cachedSettings = { ...DEFAULTS };
    }
  } catch { /* تجاهل أي خطأ قراءة */ }
  if (!cachedSettings) {
    cachedSettings = { ...DEFAULTS };
  }
  cacheTime = now;
  return cachedSettings;
}

// ✏️ تحديث الإعدادات وحفظها على القرص
export function updateSettings(partial: Partial<SiteSettings>): SiteSettings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    cachedSettings = updated;
    cacheTime = Date.now();
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
  return updated;
}
