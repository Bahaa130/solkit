// src/branding.tsx
// 🏷️ مزوّد الهوية: يجلب اسم المشروع وبيانات العملة (الاسم/الرمز/الأيقونة) من الخادم
// ويجعلها متاحة عالمياً لتغييرها من لوحة المدير (مع تحديث عنوان الصفحة تلقائياً).
// 📴 العمل بدون إنترنت: نحفظ آخر هوية ناجحة في localStorage، ونستخدمها فوراً عند
//    الإقلاع وقبل وصول الشبكة، فلا يظهر «SOLKIT» أبداً إلا في أول نسخة install فقط.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "./lib/api";

export interface Branding {
  projectName: string; // 🏷️ اسم المشروع الظاهر في العنوان والهيدر
  tokenName: string;   // 🪙 الاسم الكامل للعملة
  tokenSymbol: string; // 🔤 رمز العملة
  tokenIcon: string;   // 🖼️ أيقونة العملة (data URL) أو نص فارغ = الإيموجي الافتراضي 💎
}

// الهوية المدمجة في التطبيق: أول ما يظهر قبل أي طلب شبكة
const BUILT_IN_BRANDING: Branding = {
  projectName: "LOL",
  tokenName: "LOL",
  tokenSymbol: "LOL",
  tokenIcon: "",
};

const DEFAULT_BRANDING: Branding = BUILT_IN_BRANDING;
const BRANDING_CACHE_KEY = "solkit.branding.v1";

/** 📴 قراءة الهوية المحفوظة محلياً (متاحة فوراً بلا شبكة) */
function readCachedBranding(): Branding | null {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<Branding>;
    if (!b || (!b.projectName && !b.tokenName && !b.tokenSymbol)) return null;
    return {
      projectName: b.projectName || BUILT_IN_BRANDING.projectName,
      tokenName: b.tokenName || BUILT_IN_BRANDING.tokenName,
      tokenSymbol: b.tokenSymbol || BUILT_IN_BRANDING.tokenName,
      tokenIcon: b.tokenIcon || "",
    };
  } catch {
    return null;
  }
}

/** 💾 حفظ الهوية محلياً لتبقى بعد الإغلاق وفقدان الشبكة */
function writeCachedBranding(b: Branding): void {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(b));
  } catch {
    /* تجاهل: الوضع الخاص أو امتلاء المساحة */
  }
}

// 🔁 مخزن على مستوى الوحدة للوصول المتزامن من دالة الترجمة t()
let _branding: Branding = readCachedBranding() ?? BUILT_IN_BRANDING;
const _listeners = new Set<() => void>();

export function getBranding(): Branding {
  return _branding;
}

function setBrandingSync(b: Partial<Branding>) {
  _branding = { ..._branding, ...b };
  writeCachedBranding(_branding);
  _listeners.forEach((l) => l());
}

function applyDocumentTitle(b: Branding) {
  try {
    if (b.projectName) document.title = b.projectName;
  } catch {
    /* تجاهل */
  }
}

interface BrandingContextValue {
  branding: Branding;
  setBranding: (b: Partial<Branding>) => void;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  // 📴 نبدأ من الهوية المحفوظة/المدمجة (تظهر فوراً) ثم نحدّثها من الشبكة إن توفّرت
  const [branding, setBrandingState] = useState<Branding>(_branding);

  useEffect(() => {
    let active = true;
    applyDocumentTitle(_branding);
    apiFetch("/api/users/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const b: Branding = {
          projectName: data.projectName || DEFAULT_BRANDING.projectName,
          tokenName: data.tokenName || DEFAULT_BRANDING.tokenName,
          tokenSymbol: data.tokenSymbol || DEFAULT_BRANDING.tokenSymbol,
          tokenIcon: data.tokenIcon || "",
        };
        setBrandingSync(b);
        setBrandingState(b);
        applyDocumentTitle(b);
      })
      .catch(() => {
        // 📴 لا شبكة: نُبقي هوية localStorage/المدمجة كما هي
        if (active) applyDocumentTitle(_branding);
      });
    return () => {
      active = false;
    };
  }, []);

  const setBranding = (b: Partial<Branding>) => {
    const merged = { ..._branding, ...b };
    setBrandingSync(merged);
    setBrandingState(merged);
    applyDocumentTitle(merged);
  };

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    return { branding: _branding, setBranding: (b) => setBrandingSync(b) };
  }
  return ctx;
}
