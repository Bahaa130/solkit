// backend/src/config/settings.ts
// ⚙️ إعدادات الموقع العامة (الصيانة + عدّاد TGE) — محفوظة في ملف JSON على القرص
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.resolve(__dirname, "../../settings.json");
// 📊 القيم الافتراضية لنقاط النشاط (تُستخدم عند غياب قيمة المستوى أو العامة)
export const DEFAULT_ACTIVITY_XP = {
    xpLogin: 10,
    xpTask: 25,
    xpGame: 5,
    xpRef: 50,
    xpMine: 30,
    xpBonus: 15,
};
const DEFAULTS = {
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
    tokenSupply: 1000000,
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
    activationFullLamports: 30000000, // 0.03 SOL
    activationHalfLamports: 15000000, // 0.015 SOL
    siteShare: 0.015,
    referrerShare: 0.015,
    xpLogin: 10,
    xpTask: 25,
    xpGame: 5,
    xpRef: 50,
    xpMine: 30,
    xpBonus: 15,
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
};
// 📖 قراءة الإعدادات من القرص (تعيد القيم الافتراضية عند عدم وجود الملف)
export function getSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
            return { ...DEFAULTS, ...JSON.parse(raw) };
        }
    }
    catch { /* تجاهل أي خطأ قراءة */ }
    return { ...DEFAULTS };
}
// ✏️ تحديث الإعدادات وحفظها على القرص
export function updateSettings(partial) {
    const current = getSettings();
    const updated = { ...current, ...partial };
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    }
    catch (err) {
        console.error("Failed to save settings:", err);
    }
    return updated;
}
