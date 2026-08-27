// src/i18n/index.tsx
// 🌐 مزوّد اللغة: useLang() → { lang, dir, setLang, t }

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LANG, LANGS, LANG_STORAGE_KEY, type LangMeta } from "./lang";
import { TRANSLATIONS } from "./translations";
import { useBranding } from "../branding";

export type LangCode = string;

interface LanguageContextValue {
  lang: LangCode;
  dir: "rtl" | "ltr";
  meta: LangMeta;
  setLang: (code: LangCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLang(): LangCode {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && LANGS.some((l) => l.code === stored)) return stored;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  const base = (nav || "").split("-")[0].toLowerCase();
  if (LANGS.some((l) => l.code === base)) return base;
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(getInitialLang);
  const meta = useMemo(
    () => LANGS.find((l) => l.code === lang) ?? LANGS[0],
    [lang],
  );
  const dir: "rtl" | "ltr" = meta.dir;
  // 🏷️ نقرأ الهوية (اسم المشروع/العملة) لحقنها تلقائياً في الترجمات عبر {token}/{app}
  const { branding } = useBranding();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const dict = TRANSLATIONS[lang] ?? TRANSLATIONS[DEFAULT_LANG];
      let str =
        dict[key] ?? TRANSLATIONS[DEFAULT_LANG][key] ?? key;
      // 🪄 حقن تلقائي لاسم العملة والمشروع في كل الترجمات
      str = str.replaceAll("{token}", branding.tokenSymbol).replaceAll("{app}", branding.projectName);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang, branding],
  );

  const setLang = useCallback((code: LangCode) => {
    if (!LANGS.some((l) => l.code === code)) return;
    setLangState(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);

  const value = useMemo(
    () => ({ lang, dir, meta, setLang, t }),
    [lang, dir, meta, setLang, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLang must be used within <LanguageProvider>");
  }
  return ctx;
}
