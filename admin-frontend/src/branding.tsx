// src/branding.tsx
// 🏷️ مزوّد الهوية: يجلب اسم المشروع وبيانات العملة (الاسم/الرمز/الأيقونة) من الخادم
// ويجعلها متاحة عالمياً لتغييرها من لوحة المدير (مع تحديث عنوان الصفحة تلقائياً).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "./lib/api";

export interface Branding {
  projectName: string; // 🏷️ اسم المشروع الظاهر في العنوان والهيدر
  tokenName: string;   // 🪙 الاسم الكامل للعملة
  tokenSymbol: string; // 🔤 رمز العملة
  tokenIcon: string;   // 🖼️ أيقونة العملة (data URL) أو نص فارغ = الإيموجي الافتراضي 💎
}

const DEFAULT_BRANDING: Branding = {
  projectName: "SOLKIT",
  tokenName: "SOLKIT",
  tokenSymbol: "SOLKIT",
  tokenIcon: "",
};

// 🔁 مخزن على مستوى الوحدة للوصول المتزامن من دالة الترجمة t()
let _branding: Branding = DEFAULT_BRANDING;
const _listeners = new Set<() => void>();

export function getBranding(): Branding {
  return _branding;
}

function setBrandingSync(b: Partial<Branding>) {
  _branding = { ..._branding, ...b };
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
  const [branding, setBrandingState] = useState<Branding>(_branding);

  useEffect(() => {
    let active = true;
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
      .catch(() => {});
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
