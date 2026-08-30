import { apiFetch } from "../lib/api";
// src/components/RulesPanel.tsx
// 🧮 ثوابت الأرقام المتحكَّم بها من الإدارة: مكافآت البونص اليومي، رسوم التفعيل
import React, { useEffect, useState } from "react";
import { C, font } from "../theme";

interface Props {
  token: string;
}

const DAY_LABELS = ["اليوم 1", "اليوم 2", "اليوم 3", "اليوم 4", "اليوم 5", "اليوم 6", "اليوم 7 🔥"];

export default function RulesPanel({ token }: Props) {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  const [daily, setDaily] = useState<string[]>(["1", "2", "3", "4", "5", "6", "10"]);
  const [dailyMult, setDailyMult] = useState("5");
  const [fullSol, setFullSol] = useState("0.03");
  const [halfSol, setHalfSol] = useState("0.015");
const [siteSharePct, setSiteSharePct] = useState("1.5");
  const [refSharePct, setRefSharePct] = useState("1.5");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch("/api/users/settings");
      const d = await res.json();
      if (res.ok && d) {
        if (Array.isArray(d.dailyRewards) && d.dailyRewards.length) {
          setDaily(d.dailyRewards.map((v: number) => String(v)));
        }
        setDailyMult(String(Number((d.dailyLevelMult ?? 0.05) * 100).toFixed(2)));
        setFullSol(String(Number((Number(d.activationFullLamports) || 30000000) / 1e9).toFixed(6)));
        setHalfSol(String(Number((Number(d.activationHalfLamports) || 15000000) / 1e9).toFixed(6)));
setSiteSharePct(String(Number((d.siteShare ?? 0.015) * 100).toFixed(2)));
        setRefSharePct(String(Number((d.referrerShare ?? 0.015) * 100).toFixed(2)));
      }
    } catch {
      setStatus({ type: "error", text: "تعذر تحميل الإعدادات الحالية" });
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const rewards = daily.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (rewards.length < 1) { setStatus({ type: "error", text: "أضف قيمة واحدة على الأقل لمكافآت البونص" }); return; }
    const full = Number(fullSol);
    const half = Number(halfSol);
    if (!Number.isFinite(full) || full <= 0 || !Number.isFinite(half) || half <= 0) {
      setStatus({ type: "error", text: "أدخل قيماً صحيحة لرسوم التفعيل (SOL)" }); return;
    }
    const payload: Record<string, unknown> = {
      dailyRewards: rewards,
      dailyLevelMult: (Number(dailyMult) || 0) / 100,
      activationFullLamports: Math.round(full * 1e9),
      activationHalfLamports: Math.round(half * 1e9),
siteShare: (Number(siteSharePct) || 0) / 100,
      referrerShare: (Number(refSharePct) || 0) / 100,
    };
    try {
      setSaving(true);
      const res = await apiFetch("/api/users/admin/settings", { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await res.json();
      setStatus(res.ok
        ? { type: "success", text: data.message || "تم حفظ الثوابت وتُطبَّق فوراً على كل المستخدمين ✅" }
        : { type: "error", text: data.message || "فشل حفظ الإعدادات" });
    } catch {
      setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  };

  const statusStyle: React.CSSProperties = status?.type === "error"
    ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
    : status?.type === "success"
      ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
      : { background: "rgba(0,255,204,0.08)", borderColor: "rgba(0,255,204,0.25)", color: C.teal };

  const field = (): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 });
  const labelStyle: React.CSSProperties = { color: C.muted, fontSize: 12, fontWeight: 700 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 13, boxSizing: "border-box" };

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>🧮 ثوابت الأرقام (تتحكم بها الإدارة)</h1>
<p style={styles.subtitle}>
          غيّر مكافآت البونص اليومي ورسوم التفعيل — تُطبَّق فوراً على جميع المستخدمين
          دون إعادة بناء التطبيق (القيم تُقرأ من الخادم لحظة الفتح).
        </p>
      </div>

      {status && <div style={{ ...styles.statusBox, ...statusStyle }}>{status.text}</div>}

      {/* 🎁 مكافآت البونص اليومي */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>🎁 مكافآت البونص اليومي (أيام السلسلة)</h3>
        <div style={styles.grid}>
          {DAYS_ORDER.map((idx) => (
            <div key={idx} style={field()}>
              <label style={labelStyle}>{DAY_LABELS[idx]}</label>
              <input className="input" type="number" min="0" step="0.01" style={inputStyle}
                value={daily[idx] ?? ""} onChange={(e) => { const n = [...daily]; n[idx] = e.target.value; setDaily(n); }} />
            </div>
          ))}
          <div style={field()}>
            <label style={labelStyle}>مضاعف المستوى (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.5" style={inputStyle} value={dailyMult} onChange={(e) => setDailyMult(e.target.value)} />
          </div>
        </div>
        <p style={styles.hint}>الافتراضي: 1, 2, 3, 4, 5, 6, 10 توكن + 5% لكل مستوى. اليوم 7 (إكمال أسبوع) هو ذروة السلسلة.</p>
      </div>

      {/* 💰 رسوم التفعيل والتقسيم */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>💰 رسوم التفعيل وحصص التقسيم (SOL)</h3>
        <div style={styles.grid}>
          <div style={field()}>
            <label style={labelStyle}>الرسوم كاملة (بدون إحالة) — SOL</label>
            <input className="input" type="number" min="0.000000001" step="0.001" style={inputStyle} value={fullSol} onChange={(e) => setFullSol(e.target.value)} />
          </div>
          <div style={field()}>
            <label style={labelStyle}>حصة كل محفظة (مع إحالة) — SOL</label>
            <input className="input" type="number" min="0.000000001" step="0.001" style={inputStyle} value={halfSol} onChange={(e) => setHalfSol(e.target.value)} />
          </div>
          <div style={field()}>
            <label style={labelStyle}>حصة الموقع (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.1" style={inputStyle} value={siteSharePct} onChange={(e) => setSiteSharePct(e.target.value)} />
          </div>
          <div style={field()}>
            <label style={labelStyle}>حصة المحيل (%)</label>
            <input className="input" type="number" min="0" max="100" step="0.1" style={inputStyle} value={refSharePct} onChange={(e) => setRefSharePct(e.target.value)} />
          </div>
        </div>
<p style={styles.hint}>الافتراضي: 0.03 كاملة / 0.015+0.015 مقسّمة / 1.5% + 1.5% عمولات. هذه المبالغ تُعرض للمستخدم على صفحة الدفع.</p>
      </div>

      {/* 💾 حفظ */}
      <div style={styles.saveRow}>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={styles.saveBtn}>
          {saving ? "جارِ الحفظ..." : "💾 حفظ الثوابت وتطبيقها فوراً"}
        </button>
      </div>
    </div>
  );
}

const DAYS_ORDER = [0, 1, 2, 3, 4, 5, 6];

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", direction: "rtl", fontFamily: font, width: "100%", minWidth: 0, boxSizing: "border-box" },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 1.8 },
  statusBox: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,255,204,0.25)", fontSize: 13, lineHeight: 1.7, textAlign: "right" },
  card: { padding: 24 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  grid: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
  hint: { color: C.faint, fontSize: 11.5, margin: "12px 0 0", lineHeight: 1.7 },
  saveRow: { textAlign: "center" },
  saveBtn: { padding: "13px 32px", fontSize: 14, fontWeight: 800 },
};
