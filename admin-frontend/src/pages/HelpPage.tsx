// src/pages/HelpPage.tsx
// 🛡️ الحماية والتعليمات — دليل التثبيت والتعامل مع تحذير Google Play Protect
import { C, styles as T } from "../theme";
import { useLang } from "../i18n/index.tsx";

export default function HelpPage() {
  const { dir, t } = useLang();

  const steps = [
    { icon: "🔍", title: t("help.step1t"), desc: t("help.step1d") },
    { icon: "📲", title: t("help.step2t"), desc: t("help.step2d") },
    { icon: "⚙️", title: t("help.step3t"), desc: t("help.step3d") },
    { icon: "✅", title: t("help.step4t"), desc: t("help.step4d") },
  ];

  return (
    <div style={{ ...T.page, direction: dir, maxWidth: 620 }}>
      {/* ترويسة الحماية */}
      <div className="glass" style={s.hero}>
        <div style={s.heroBadge}>🛡️</div>
        <h2 style={s.heroTitle}>{t("help.title")}</h2>
        <p style={s.heroDesc}>{t("help.subtitle")}</p>
        <div className="pill" style={s.safePill}>🛡️ {t("help.safeTag")}</div>
      </div>

      {/* ما هو Play Protect */}
      <div className="glass" style={s.card}>
        <h3 style={s.cardTitle}>🔎 {t("help.whatTitle")}</h3>
        <p style={s.cardText}>{t("help.whatDesc")}</p>
      </div>

      {/* خطوات التثبيت */}
      <div className="glass" style={s.card}>
        <h3 style={s.cardTitle}>📋 {t("help.stepsTitle")}</h3>
        {steps.map((st, i) => (
          <div key={i} style={s.stepRow}>
            <div style={s.stepNum}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={s.stepTitle}>{st.icon} {st.title}</div>
              <div style={s.stepDesc}>{st.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* طمأنة الأمان */}
      <div className="glass" style={s.safeCard}>
        <div style={{ fontSize: 40, textAlign: "center" }} className="floaty">🛡️</div>
        <h3 style={{ ...s.cardTitle, textAlign: "center", marginTop: 8 }}>{t("help.safeTitle")}</h3>
        <p style={{ ...s.cardText, textAlign: "center" }}>{t("help.safeDesc")}</p>
      </div>
    </div>
  );
}

const s: { [key: string]: React.CSSProperties } = {
  hero: { padding: 28, marginBottom: 18, textAlign: "center" },
  heroBadge: {
    width: 74, height: 74, margin: "0 auto 14px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
    background: "rgba(34,229,132,0.1)", border: "1px solid rgba(34,229,132,0.3)",
    boxShadow: "0 0 26px rgba(34,229,132,0.2)",
  },
  heroTitle: { fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 8 },
  heroDesc: { color: C.muted, fontSize: 13, lineHeight: 1.9, marginBottom: 14 },
  safePill: {
    background: "rgba(34,229,132,0.12)", color: C.green, fontWeight: 800,
    border: "1px solid rgba(34,229,132,0.35)", fontSize: 12,
  },
  card: { padding: 22, marginBottom: 18 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 12px 0" },
  cardText: { color: C.muted, fontSize: 13, lineHeight: 2 },
  stepRow: {
    display: "flex", gap: 13, alignItems: "flex-start",
    padding: "13px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  stepNum: {
    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg,#00ffcc,#00b8ff)", color: "#061018",
    fontWeight: 900, fontSize: 14, marginTop: 1,
  },
  stepTitle: { fontSize: 13.5, fontWeight: 800, color: C.text, marginBottom: 4 },
  stepDesc: { color: C.faint, fontSize: 12, lineHeight: 1.9 },
  safeCard: { padding: 26, marginBottom: 18, background: "rgba(34,229,132,0.05)", borderColor: "rgba(34,229,132,0.25)" },
};