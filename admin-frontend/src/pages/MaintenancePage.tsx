// src/pages/MaintenancePage.tsx
// 🔧 صفحة "التطبيق تحت الصيانة" — تُعرض عند تفعيل وضع الصيانة من لوحة المدير
import React from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";

interface MaintenancePageProps {
  onLogout?: () => void;
}

export default function MaintenancePage({ onLogout }: MaintenancePageProps) {
  const { dir, t } = useLang();

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div className="glass" style={styles.card}>
        <div className="floaty" style={styles.icon}>🛠️</div>

        <div style={styles.badge}>{t("maintenance.badge")}</div>

        <h1 style={styles.title}>{t("maintenance.title")}</h1>
        <p style={styles.desc}>
          {t("maintenance.desc")}
        </p>

        {/* 🔄 مؤشر تحميل حي */}
        <div style={styles.spinnerWrap}>
          <span className="spinner" style={{ ...styles.spinner, borderTopColor: C.teal }} />
        </div>

        <p style={styles.hint}>{t("maintenance.hint")}</p>

        {onLogout && (
          <button onClick={onLogout} className="btn btn-ghost" style={styles.logoutBtn}>
            🚪 {t("app.logout")}
          </button>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 18px",
    fontFamily: font,
    background: "radial-gradient(circle at 50% 25%, rgba(124,92,255,0.10), transparent 60%)",
  },
  card: {
    maxWidth: 440,
    width: "100%",
    padding: "44px 32px",
    textAlign: "center",
    animation: "fadeInUp .5s cubic-bezier(.16,1,.3,1) both",
  },
  icon: { fontSize: 60, marginBottom: 12 },
  badge: {
    display: "inline-block",
    background: "rgba(255,176,32,0.15)",
    color: C.amber,
    border: "1px solid rgba(255,176,32,0.35)",
    padding: "6px 16px",
    fontSize: 12,
    fontWeight: 800,
    borderRadius: 999,
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: 900, color: C.text, margin: "0 0 12px" },
  desc: { color: C.muted, fontSize: 14, lineHeight: 1.9, margin: "0 0 24px" },
  spinnerWrap: { display: "flex", justifyContent: "center", marginBottom: 18 },
  spinner: {
    width: 34,
    height: 34,
    border: "3px solid rgba(255,255,255,0.12)",
    borderRadius: "50%",
    display: "inline-block",
  },
  hint: { color: C.faint, fontSize: 11.5, fontWeight: 700, margin: 0 },
  logoutBtn: { padding: "10px 20px", fontSize: 13, fontWeight: 700 },
};
