// backend/src/config/settings.ts
// ⚙️ إعدادات الموقع العامة (الصيانة + عدّاد TGE) — محفوظة في قاعدة البيانات (MySQL)
// مع نسخة على القرص احتياطياً. تخزين DB ضروري لأن نظام Render المجاني يمحو
// ملفات القرص عند إعادة التشغيل، فالإعدادات المُغيّرة (مثل تفعيل الاكتتاب) كانت
// تتراجع إلى الافتراضية تلقائياً.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";
import { toEnglishContent } from "../modules/users/contentEn.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.resolve(__dirname, "../../settings.json");
const SETTINGS_KEY = "site";

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
  games: GamesSettings;               // 🎮 اقتصاد ألعاب المهارة (تحدّي النقر + اصطياد العملات)
  tokenomics: TokenomicsSplit[];      // 💼 اقتصاديات التوكن — نسب توزيع العرض الكلي (تتحكم بها الإدارة)
  cards?: CardDef[];                  // 📇 بطاقات الدخل القابلة للترقية (نموذج هامستر)
  ico?: IcoSettings;                  // 🏗️ صفحة الاكتتاب (ICO/pre-sale) — المحتوى تتحكم به الإدارة بالكامل
}

// 🏗️ إعدادات صفحة الاكتتاب (ICO/pre-sale) — يُدار المحتوى من لوحة المدير
export interface IcoSettings {
  enabled: boolean;        // 🔛 تفعيل صفحة الاكتتاب ومشاركة المستخدمين
  title: string;           // 🏷️ عنوان الصفحة
  subtitle: string;        // 📝 وصف فرعي قصير
  description: string;     // 📄 الوصف الكامل
  priceSOL: number;        // 💵 سعر التوكن الواحد بالـ SOL
  minSOL: number;          // 🪙 الحد الأدنى للمشاركة بالـ SOL
  maxSOL: number;          // 📈 الحد الأقصى للمشاركة في المعاملة الواحدة بالـ SOL
  maxPerWalletSOL: number; // 👛 الحد الأقصى التراكمي لكل محفظة (لا تشتري بأكثر منه إجمالاً) بالـ SOL
  totalAllocation: number; // 🎯 إجمالي التوكنات المخصصة للاكتتاب
  startDate: number;       // ⏰ بداية الاكتتاب (timestamp بالملي ثانية، 0 = فوراً)
  endDate: number;         // 🏁 نهاية الاكتتاب (timestamp بالملي ثانية، 0 = مفتوح)
  softCapSOL: number;      // 🎖️ الهدف الأدنى (ناعم) بالـ SOL
  hardCapSOL: number;      // 💰 الهدف الأقصى (صلب) بالـ SOL
  tgePercent: number;      // 🚀 نسبة التوكنات المتاحة فور الإدراج (TGE) — الباقي وفق جدول الاستحقاق
  perks: IcoPerk[];        // 🎁 مزايا المشاركة (بطاقات)
  faq: IcoFaq[];           // ❓ أسئلة شائعة
  vesting: IcoVesting[];   // 📅 جدول الإفراج/الاستحقاق
  terms: string;           // 📜 الشروط والأحكام
}

export interface IcoPerk { icon: string; title: string; desc: string }
export interface IcoFaq { q: string; a: string }
export interface IcoVesting { label: string; pct: number; when: string }

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

// 🎮 اقتصاد الألعاب other than wheel — كان ثابتاً في الكود فكان يُصدر رصيداً
// يتجاوز ميزانية الإصدار بالكامل (XO وحده: 60 توكن/يوم/مستخدم). صار يضبطه المدير.
export interface GamesSettings {
  xoWinReward: number;        // توكن لكل فوز في تحدّي النقر
  xoCooldownSec: number;      // ثوانٍ بين جولتين
  xoDailyCap: number;         // سقف أرباح XO اليومي (توكن)
  catchCoinReward: number;    // توكن لكل عملة ملتقطة
  catchCooldownSec: number;   // ثوانٍ بين جولتين
  catchDailyCap: number;      // سقف أرباح الاصطياد اليومي (توكن)
  catchMaxScore: number;      // أقصى عدد عملات في الجولة
  totalDailyCap: number;      // السقف اليومي الإجمالي لكل الألعاب معاً
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

export const DEFAULTS: SiteSettings = {
  maintenanceMode: false,
  maintenanceMessage: "Scheduled maintenance in progress. Back shortly! 🔧",
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
    { level: 1, name: "Beginner", minXp: 0, color: "#94a3b8", miningRate: 0.50, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 2, name: "Beginner+", minXp: 120, color: "#4ade80", miningRate: 0.58, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 3, name: "Active", minXp: 300, color: "#22d3ee", miningRate: 0.68, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 4, name: "Advanced", minXp: 600, color: "#3b82f6", miningRate: 0.80, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 5, name: "Professional", minXp: 1100, color: "#a855f7", miningRate: 0.95, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 6, name: "Expert", minXp: 1900, color: "#ec4899", miningRate: 1.12, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 7, name: "Legendary", minXp: 3200, color: "#f59e0b", miningRate: 1.32, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 8, name: "Prestige", minXp: 5200, color: "#ef4444", miningRate: 1.55, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
    { level: 9, name: "Summit", minXp: 8000, color: "#fde047", miningRate: 1.85, xpLogin: 10, xpTask: 25, xpGame: 5, xpRef: 50, xpMine: 30, xpBonus: 15 },
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
    { icon: "⚙️", label: "Core System Build", status: "done" },
    { icon: "🔐", label: "Security Audit + Testing", status: "done" },
    { icon: "🚀", label: "Beta Launch", status: "current" },
    { icon: "🦍", label: "Full Launch", status: "upcoming" },
    { icon: "🌐", label: "Expansion & Exchanges", status: "upcoming" },
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
  // 🎮 اقتصاد ألعاب المهارة — يضبطه المدير (كان مثبّتاً في الكود فكان يصدر رصيداً خارج الميزانية)
  games: {
    xoWinReward: 0.30,
    xoCooldownSec: 3600,
    xoDailyCap: 2,
    catchCoinReward: 0.05,
    catchCooldownSec: 3600,
    catchDailyCap: 1.5,
    catchMaxScore: 80,
    totalDailyCap: 6,
  },
  // 💼 اقتصاديات التوكن الافتراضية: نسب توزيع العرض الكلي (تتحكم بها الإدارة من لوحة المدير)
  tokenomics: [
    { label: "Mining", pct: 40, color: "#00ffcc" },
    { label: "Games", pct: 25, color: "#7c5cff" },
    { label: "Community", pct: 20, color: "#ffb020" },
    { label: "Team", pct: 15, color: "#ff5c7a" },
  ],
  // 📇 بطاقات الدخل الافتراضية (حملات إعلانية تُرقى بالنقاط = إيراد يضاف لمعدل التعدين)
  cards: [
    { key: "ads_influencer", icon: "🤳", label: "Influencer Marketing", color: "#f43f5e", baseCost: 50, costGrowth: 1.18, reward: 0.04, maxLevel: 20, duration: 1 },
    { key: "ads_video", icon: "🎬", label: "Promotional Video", color: "#8b5cf6", baseCost: 120, costGrowth: 1.2, reward: 0.08, maxLevel: 15, duration: 1 },
    { key: "ads_banner", icon: "🖼️", label: "Banner Ads", color: "#0ea5e9", baseCost: 300, costGrowth: 1.22, reward: 0.16, maxLevel: 12, duration: 2 },
    { key: "ads_telegram", icon: "📣", label: "Telegram Channels", color: "#22c55e", baseCost: 750, costGrowth: 1.25, reward: 0.32, maxLevel: 10, duration: 2 },
    { key: "ads_coupons", icon: "🎟️", label: "Discount Coupons", color: "#f59e0b", baseCost: 1800, costGrowth: 1.28, reward: 0.64, maxLevel: 8, duration: 3 },
    { key: "ads_tv", icon: "📺", label: "TV Advertisement", color: "#ef4444", baseCost: 4500, costGrowth: 1.3, reward: 1.2, maxLevel: 6, duration: 4 },
  ],
  // 🏗️ الإعدادات الافتراضية لصفحة الاكتتاب (يضبطها المدير دائماً من لوحة التحكم)
  ico: {
    enabled: false,
    title: "Early Participation Sale 🚀",
    subtitle: "Buy {token} tokens at the pre-sale price and be among the first investors in the platform.",
    description:
      "The early participation journey for the {token} token: request your tokens before exchange listing, pay directly in SOL from your wallet, and receive your allocation following the vesting schedule.",
    priceSOL: 0.001,
    minSOL: 0.05,
    maxSOL: 10,
    maxPerWalletSOL: 10,
    totalAllocation: 100000,
    startDate: 0,
    endDate: 0,
    softCapSOL: 20,
    hardCapSOL: 100,
    tgePercent: 25,
    perks: [
      { icon: "💎", title: "Preferential Price", desc: "A price below the expected exchange listing price." },
      { icon: "🛡️", title: "Reservation Priority", desc: "Your allocation is reserved in your name as soon as it is confirmed on-chain." },
      { icon: "🎁", title: "Referral Bonuses", desc: "Share your link and earn additional bonuses." },
    ],
    faq: [
      { q: "When do I receive my tokens?", a: "Your allocation is recorded as soon as the payment is confirmed on-chain, and is released according to the vesting schedule after listing." },
      { q: "هل يُسترد المبلغ إذا لم تكتمل اللوحة؟", a: "If the sale does not reach its soft cap, transactions are returned after the close with no fees." },
    ],
    vesting: [
      { label: "At Listing (TGE)", pct: 25, when: "Immediately" },
      { label: "Second Tranche", pct: 25, when: "After 3 months" },
      { label: "Third Tranche", pct: 25, when: "After 6 months" },
      { label: "Final Tranche", pct: 25, when: "After 12 months" },
    ],
    terms:
      "Sale payments are sent to the on-chain treasury wallet and are recorded automatically between the app and the server. Digital tokens may rise or fall in value and we guarantee no specific performance. Verify eligibility and local regulations in your country before participating.",
  },
};

// 📖 قراءة الإعدادات (الملف المحلي مُطابِقٌ للقيم الافتراضية فقط)
// 🗄️ بعد أول تحميل ناجح من قاعدة البيانات (أو أول كتابة) تصبح قاعدة البيانات
//    هي المرجع الوحيد: لا نُعيد قراءة settings.json إطلاقاً، لأن ملفه على Render
//    للقراءة فقط (فشل صامت) فكانت أي تعديلات تُمحى بعد 5 ثوانٍ عند انتهاء الـ TTL.
let cachedSettings: SiteSettings | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5000;

/** وجهة تحميل الإعدادات (قاعدة البيانات تغلب على الملف المحلي بعد أول نجاح) */
let hydratePromise: Promise<boolean> | null = null;
let dbChain: Promise<void> = Promise.resolve();
/** true = المرجع الآن هو قاعدة البيانات (لا ملف) */
let dbAuthoritative = false;
/** آخر خطأ في الكتابة إلى قاعدة البيانات (لعرضه للمدير بدل ادّعاء النجاح) */
let lastPersistError: string | null = null;

function mergeParsed(parsed: Partial<SiteSettings>): SiteSettings {
  const ico: IcoSettings = { ...DEFAULTS.ico, ...(parsed?.ico ?? {}) } as IcoSettings;
  // 🌍 محتوى المدير يُعرض بالإنجليزية: نطبّع النصوص الافتراضية القديمة هنا،
  //    فأي نص كتبه المدير بنفسه أو عدّله يبقى كما هو (المطابقة حرفية).
  return toEnglishContent({ ...DEFAULTS, ...parsed, ico }) as SiteSettings;
}

export function getSettings(): SiteSettings {
  const now = Date.now();
  if (cachedSettings && now - cacheTime < CACHE_TTL_MS) {
    return cachedSettings;
  }
  if (dbAuthoritative && cachedSettings) {
    // 🗄️ المرجع = قاعدة البيانات. نُبقي الذاكرة مرجعاً للقراءات المتزامنة
    //    ونُحدّثها في الخلفية، بدل الرجوع للملف (كتابةُه تفشل على Render).
    cacheTime = now;
    void refreshFromDb();
    return cachedSettings;
  }
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
      cachedSettings = mergeParsed(JSON.parse(raw));
    } else {
      cachedSettings = mergeParsed({});
    }
  } catch {
    /* تجاهل أي خطأ قراءة */
  }
  if (!cachedSettings) {
    cachedSettings = mergeParsed({});
  }
  cacheTime = now;
  return cachedSettings!;
}

// 🗄️ تحميل الإعدادات من قاعدة البيانات عند إقلاع الخادم (يغلب على الملف المحلي):
// يضمن بقاء ما حفظه المدير (تفعيل الاكتتاب وغيره) حتى بعد إعادة تشغيل Render.
async function loadFromDb(): Promise<boolean> {
  try {
    const row = await prisma
      .appSetting
      .findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.value) return false;
    const parsed = JSON.parse(row.value) as Partial<SiteSettings>;
    cachedSettings = mergeParsed(parsed);
    cacheTime = Date.now();
    dbAuthoritative = true;
    return true;
  } catch (err) {
    console.error("Failed to load settings from DB:", err);
    return false;
  }
}

/** 🔄 تحديث الذاكرة من قاعدة البيانات (بدون تغيير المرجع) — يُستدعى في الخلفية. */
async function refreshFromDb(): Promise<void> {
  try {
    const row = await prisma
      .appSetting
      .findUnique({ where: { key: SETTINGS_KEY } });
    if (!row?.value) return;
    const parsed = JSON.parse(row.value) as Partial<SiteSettings>;
    const next = mergeParsed(parsed);
    // نتجاهل التحديث إن كان مطابقاً للذاكرة (سباق مع الكتابة)
    if (JSON.stringify(next) !== JSON.stringify(cachedSettings)) {
      cachedSettings = next;
      cacheTime = Date.now();
    }
  } catch {
    /* تجاهل: نُبقي الذاكرة كما هي */
  }
}

/** استدعاء واحد عند الإقلاع قبل فتح الخادم للطلبات. */
export function hydrateSettingsFromDb(): Promise<boolean> {
  if (!hydratePromise) hydratePromise = loadFromDb();
  return hydratePromise;
}

/** 🔁 كتابة الإعدادات إلى قاعدة البيانات (موصولة بالتسلسل لتجنّب السباق بين الحفظات). */
function persistToDb(updated: SiteSettings): void {
  dbChain = dbChain.then(async () => {
    try {
      await prisma.appSetting.upsert({
        where: { key: SETTINGS_KEY },
        create: { key: SETTINGS_KEY, value: JSON.stringify(updated) },
        update: { value: JSON.stringify(updated) },
      });
      // 🗄️ بعد أول كتابة ناجحة تصبح قاعدة البيانات المرجع: نتوقّف عن قراءة الملف
      //    (كان يُعيد القيم القديمة بعد 5 ثوانٍ على Render لأن كتابته تفشل هناك).
      dbAuthoritative = true;
      lastPersistError = null;
    } catch (err) {
      lastPersistError = err instanceof Error ? err.message : String(err);
      console.error("Failed to persist settings to DB:", err);
    }
  });
}

/**
 * ⏳ انتظار انتهاء كل عمليات الكتابة المعلّقة + نتيجة آخرها.
 * تستعملها مسارات الحفظ لتُبلغ المدير بالفشل بدل أن ترجع 200 نجاحاً كاذباً.
 */
export async function flushSettingsToDb(): Promise<{ ok: boolean; error: string | null }> {
  try {
    await dbChain;
  } catch {
    /* persistToDb يبتلع الأخطاء ويسجّلها في lastPersistError */
  }
  return { ok: lastPersistError === null, error: lastPersistError };
}

// ✏️ تحديث الإعدادات وحفظها على القرص + قاعدة البيانات
export function updateSettings(partial: Partial<SiteSettings>): SiteSettings {
  const current = getSettings();
  const updated = mergeParsed({ ...current, ...partial, ico: partial.ico ? { ...current.ico, ...partial.ico } : current.ico });
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    // ⚠️ متوقّع على Render (نظام الملفات للقراءة فقط) — لا يوقف الحفظ، والقاعدة هي المرجع.
    console.warn("settings.json write skipped (read-only fs?):", err instanceof Error ? err.message : err);
  }
  cachedSettings = updated;
  cacheTime = Date.now();
  persistToDb(updated);
  return updated;
}
