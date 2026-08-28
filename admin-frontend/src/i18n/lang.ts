// src/i18n/lang.ts
// 🌐 تعريفات اللغات المدعومة واتجاه العرض

export interface LangMeta {
  code: string;
  flag: string;
  label: string;
  dir: "rtl" | "ltr";
}

export const LANGS: LangMeta[] = [
  { code: "en", flag: "🇬🇧", label: "English", dir: "ltr" },
  { code: "fr", flag: "🇫🇷", label: "Français", dir: "ltr" },
  { code: "es", flag: "🇪🇸", label: "Español", dir: "ltr" },
  { code: "ar", flag: "🇸🇦", label: "العربية", dir: "rtl" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe", dir: "ltr" },
];

export const DEFAULT_LANG = "en";
export const LANG_STORAGE_KEY = "solkit_lang";
