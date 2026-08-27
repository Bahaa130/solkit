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
  levelPlan: LevelDef[];      // 🎯 خطة المستويات التسعة (النشاط) — يضبطها المدير
}

// 🎯 تعريف مستوى واحد في خطة المستويات (يُدار من لوحة المدير)
export interface LevelDef {
  level: number;     // رقم المستوى (1..9)
  name: string;      // اسم/عنوان المستوى (نص يضبطه المدير)
  minXp: number;     // الحد الأدنى لرصيد النشاط للوصول لهذا المستوى
  color: string;     // لون/ثيم عداد التعدين (hex)
  miningRate: number;// معدل التعدين (SOL لكل جلسة 24 ساعة)
}

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
  levelPlan: [
    { level: 1, name: "المبتدئ", minXp: 0, color: "#94a3b8", miningRate: 0.50 },
    { level: 2, name: "المبتدئ+", minXp: 120, color: "#4ade80", miningRate: 0.58 },
    { level: 3, name: "النشط", minXp: 300, color: "#22d3ee", miningRate: 0.68 },
    { level: 4, name: "المتقدم", minXp: 600, color: "#3b82f6", miningRate: 0.80 },
    { level: 5, name: "المحترف", minXp: 1100, color: "#a855f7", miningRate: 0.95 },
    { level: 6, name: "الخبير", minXp: 1900, color: "#ec4899", miningRate: 1.12 },
    { level: 7, name: "الأسطوري", minXp: 3200, color: "#f59e0b", miningRate: 1.32 },
    { level: 8, name: "الفخري", minXp: 5200, color: "#ef4444", miningRate: 1.55 },
    { level: 9, name: "القمة", minXp: 8000, color: "#fde047", miningRate: 1.85 },
  ],
};

// 📖 قراءة الإعدادات من القرص (تعيد القيم الافتراضية عند عدم وجود الملف)
export function getSettings(): SiteSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch { /* تجاهل أي خطأ قراءة */ }
  return { ...DEFAULTS };
}

// ✏️ تحديث الإعدادات وحفظها على القرص
export function updateSettings(partial: Partial<SiteSettings>): SiteSettings {
  const current = getSettings();
  const updated = { ...current, ...partial };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
  return updated;
}
