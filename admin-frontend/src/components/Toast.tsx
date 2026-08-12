// src/components/Toast.tsx
// 🔔 نظام الإشعارات (Toast) المطابق لهوية الموقع — بديل عن مربعات alert() الأصلية
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "⚠️",
  warning: "🟠",
  info: "💠",
};

const ACCENTS: Record<ToastType, { color: string; bg: string; border: string }> = {
  success: { color: "#7cf5c0", bg: "rgba(34,229,132,0.1)", border: "rgba(34,229,132,0.4)" },
  error: { color: "#ff9cae", bg: "rgba(255,92,122,0.12)", border: "rgba(255,92,122,0.4)" },
  warning: { color: "#ffd38a", bg: "rgba(255,176,32,0.12)", border: "rgba(255,176,32,0.4)" },
  info: { color: C.teal, bg: "rgba(0,255,204,0.08)", border: "rgba(0,255,204,0.35)" },
};

const AUTO_DISMISS_MS = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { dir } = useLang();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]); // أقصى 4 إشعارات ظاهرة
    window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    toast,
    success: (m) => toast(m, "success"),
    error: (m) => toast(m, "error"),
    warning: (m) => toast(m, "warning"),
    info: (m) => toast(m, "info"),
  }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={containerStyle} aria-live="polite">
        {toasts.map((t) => {
          const accent = ACCENTS[t.type];
          return (
            <div
              key={t.id}
              className="toast-in"
              onClick={() => dismiss(t.id)}
              role="status"
              style={{
                ...toastStyle,
                direction: dir,
                textAlign: dir === "rtl" ? "right" : "left",
                background: accent.bg,
                borderColor: accent.border,
                boxShadow: `0 10px 34px rgba(0,0,0,0.4), 0 0 20px ${accent.border}`,
              }}
            >
              <span style={{ fontSize: 17, flexShrink: 0 }}>{ICONS[t.type]}</span>
              <span style={{ flex: 1, color: accent.color, lineHeight: 1.7 }}>{t.message}</span>
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer", flexShrink: 0, paddingInlineStart: 4 }}>✕</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  top: 18,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: "min(92vw, 460px)",
  pointerEvents: "none",
  fontFamily: font,
};

const toastStyle: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 16px",
  borderRadius: 14,
  border: "1px solid",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};
