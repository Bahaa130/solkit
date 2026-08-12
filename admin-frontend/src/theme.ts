// src/theme.ts — نظام التصميم الموحد للواجهة (توكّنات + أنماط مشتركة)
import type { CSSProperties } from "react";

// 🎨 توكّنات الألوان الأساسية
export const C = {
  bg: "#070b16",
  bgSoft: "#0d1326",
  cardBg: "rgba(255,255,255,0.045)",
  cardBorder: "rgba(255,255,255,0.09)",
  inputBg: "rgba(255,255,255,0.06)",
  inputBorder: "rgba(255,255,255,0.12)",
  text: "#eef2ff",
  muted: "#8b93ab",
  faint: "#6b748c",
  teal: "#00ffcc",
  blue: "#00b8ff",
  purple: "#7c5cff",
  amber: "#ffb020",
  green: "#22e584",
  red: "#ff5c7a",
};

// 🌈 التدرّجات اللونية
export const G = {
  primary: "linear-gradient(135deg,#00ffcc,#00b8ff)",
  purple: "linear-gradient(135deg,#7c5cff,#a855f7)",
  amber: "linear-gradient(135deg,#ffb020,#ff8a00)",
  green: "linear-gradient(135deg,#22e584,#00b8ff)",
  red: "linear-gradient(135deg,#ff5c7a,#ff4d4d)",
};

export const font = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif";

// 🧩 أنماط JSX مشتركة قابلة لإعادة الاستخدام
export const styles: { [key: string]: CSSProperties } = {
  page: {
    padding: "24px 20px 110px",
    maxWidth: 760,
    margin: "0 auto",
    color: C.text,
    direction: "rtl",
    fontFamily: font,
  },
  card: {
    background: C.cardBg,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 18,
    padding: 22,
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: C.text,
    margin: "0 0 16px 0",
    paddingBottom: 10,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  label: { color: C.muted, fontSize: 13, display: "block", marginBottom: 6 },
  value: { color: C.text, fontSize: 28, margin: 0, fontWeight: 800 },
  muted: { color: C.muted, fontSize: 13 },
  hint: { color: C.faint, fontSize: 12, textAlign: "center" as const },
  input: {
    width: "100%",
    background: C.inputBg,
    border: `1px solid ${C.inputBorder}`,
    borderRadius: 12,
    padding: "13px 16px",
    color: C.text,
    fontFamily: font,
    fontSize: 13,
    outline: "none",
  },
};
