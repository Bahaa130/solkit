// backend/src/modules/users/brandPreset.ts
// 🏷️ هوية المشروع المعتمدة — مصدر واحد للقيم التي تطبقها اللوحة
//
// ✅ الاعتماد النهائي: المشروع YOSHA · العملة Yosoku Sha · الرمز YSA
//    الأيقونة: backend/assets/brand/ysa-icon.png (256×256 PNG شفافة، 122KB)
//    تُقرأ من القرص وقت الطلب وتُحوَّل إلى data-URL (شرط مخطط التحقق في الخادم)،
//    بدل تضمين 162KB base64 داخل الشيفرة.
//
// 📴 نفس القيم مدمجة أيضاً في الواجهة (admin-frontend/src/branding.tsx) وأصلها
//    /brand/ysa-icon.png — فالهوية تظهر فوراً وبدون إنترنت، وتبقى كذلك إن تعطّل الخادم.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** src/modules/users و dist/modules/users كلاهما على عمق 3 داخل backend/ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ICON_FILE = path.resolve(__dirname, "../../../assets/brand/ysa-icon.png");

export interface BrandPreset {
  projectName: string;
  tokenName: string;
  tokenSymbol: string;
  /** data-URL جاهز للحفظ في الإعدادات (يبقى صالحاً بلا شبكة) */
  tokenIcon: string;
}

export const BRAND: Omit<BrandPreset, "tokenIcon"> = {
  projectName: "YOSHA",
  tokenName: "Yosoku Sha",
  tokenSymbol: "YSA",
};

let cachedIcon: string | null = null;

/** 🖼️ قراءة الأيقونة من القرص كـ data-URL (مع تخزين مؤقت في الذاكرة) */
export function getBrandIcon(): string {
  if (cachedIcon) return cachedIcon;
  // ⚠️ خطأ واضح بدل انهيار الخادم إن كان الملف مفقوداً في النشر
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error(`ملف أيقونة الهوية غير موجود: ${ICON_FILE}`);
  }
  const buf = fs.readFileSync(ICON_FILE);
  cachedIcon = `data:image/png;base64,${buf.toString("base64")}`;
  return cachedIcon;
}

export function getBrandPreset(): BrandPreset {
  return { ...BRAND, tokenIcon: getBrandIcon() };
}
