// src/pages/NotFoundPage.tsx
// 🚫 صفحة الخطأ 404 — متوافقة مع هوية SOLKIT (Glassmorphism + RTL/LTR)
import React from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";

// 🧭 روابط سريعة تعيد المستخدم إلى المناطق الأساسية (تُرشّح حسب الصلاحية لاحقاً في App)
const QUICK_LINKS: { key: string; tab: string }[] = [
  { key: "notfound.linkHome", tab: "home" },
  { key: "notfound.linkAirdrop", tab: "airdrop" },
  { key: "notfound.linkReferral", tab: "referral" },
  { key: "notfound.linkTasks", tab: "tasks" },
  { key: "notfound.linkBonus", tab: "bonus" },
];

interface NotFoundPageProps {
  // دالة للانتقال إلى تبويب داخل التطبيق (تُمرّر من App عند توفّر الجلسة)
  onNavigateTab?: (tab: string) => void;
}

export default function NotFoundPage({ onNavigateTab }: NotFoundPageProps) {
  const { dir, t } = useLang();

  const goHome = () => {
    if (onNavigateTab) onNavigateTab("home");
  };

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else goHome();
  };

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div className="glass" style={styles.card}>
        <div className="floaty" style={styles.emoji}>🛰️</div>

        <h1 className="gradient-text" style={styles.code}>{t("notfound.code")}</h1>
        <h2 style={styles.title}>{t("notfound.title")}</h2>
        <p style={styles.desc}>{t("notfound.desc")}</p>

        <div style={styles.actions}>
          <button onClick={goHome} className="btn btn-primary btn-block" style={styles.primary}>
            {t("notfound.home")}
          </button>
          <button onClick={goBack} className="btn btn-ghost" style={styles.ghost}>
            {t("notfound.back")}
          </button>
        </div>

        <div style={styles.quickWrap}>
          <span style={styles.quickLabel}>{t("notfound.search")}</span>
          <div style={styles.quickGrid}>
            {QUICK_LINKS.map((l) => (
              <button
                key={l.tab}
                onClick={() => onNavigateTab && onNavigateTab(l.tab)}
                className="pill"
                style={styles.quickPill}
              >
                {t(l.key)}
              </button>
            ))}
          </div>
        </div>
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
    padding: "24px 18px 110px",
    fontFamily: font,
    background: "radial-gradient(circle at 50% 20%, rgba(0,255,204,0.06), transparent 60%)",
  },
  card: {
    maxWidth: 460,
    width: "100%",
    padding: "40px 30px",
    textAlign: "center",
    animation: "fadeInUp .5s cubic-bezier(.16,1,.3,1) both",
  },
  emoji: { fontSize: 54, marginBottom: 8 },
  code: { fontSize: 72, fontWeight: 900, margin: 0, lineHeight: 1, letterSpacing: "2px" },
  title: { fontSize: 20, fontWeight: 900, color: C.text, margin: "10px 0 8px" },
  desc: { color: C.muted, fontSize: 13, lineHeight: 1.9, margin: "0 0 24px" },
  actions: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 },
  primary: { padding: "14px", fontSize: 14, fontWeight: 800 },
  ghost: { padding: "12px", fontSize: 13, color: C.muted },
  quickWrap: { borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 18 },
  quickLabel: { color: C.faint, fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 12 },
  quickGrid: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  quickPill: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: C.muted,
    padding: "8px 14px",
    fontSize: 12.5,
    cursor: "pointer",
    transition: "all .15s ease",
  },
};
