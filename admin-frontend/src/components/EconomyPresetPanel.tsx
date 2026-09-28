// admin-frontend/src/components/EconomyPresetPanel.tsx
// 🎯 تطبيق سيناريو الاقتصاد المحسوب بضغطة واحدة — القيم موجودة في الـ backend
//    (مصدر واحد: /api/users/admin/economy-scenario) وبعد التطبيق كل حقل يظل قابلاً للتعديل.
import React, { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../lib/api";
import { ECONOMY_PRESETS } from "../lib/economyPresets";
import { useToast } from "./Toast";
import { C } from "../theme";

const S: { [k: string]: React.CSSProperties } = {
  card: {
    padding: 16,
    borderRadius: 16,
    background: "linear-gradient(135deg, rgba(0,255,204,0.07), rgba(124,92,255,0.07))",
    border: "1px solid rgba(0,255,204,0.25)",
    marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: 900, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 8 },
  desc: { fontSize: 12, lineHeight: 1.8, color: C.muted, margin: "8px 0 12px" },
  row: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  chip: {
    fontSize: 11, padding: "4px 9px", borderRadius: 999,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: C.text,
  },
  warn: {
    fontSize: 12, lineHeight: 1.7, padding: "10px 12px", borderRadius: 12, marginBottom: 12,
    background: "rgba(255,176,32,0.08)", border: "1px solid rgba(255,176,32,0.3)", color: "#ffcf7a",
  },
  applied: {
    fontSize: 12, lineHeight: 1.7, padding: "10px 12px", borderRadius: 12, marginTop: 10,
    background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac",
  },
};

export default function EconomyPresetPanel({ token }: { token: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [stopTasks, setStopTasks] = useState(true);
  const [remote, setRemote] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // 🔄 القيم المعروضة تأتي من الـ backend (المصدر الرسمي) مع بديل محلي عند فشل الطلب
  useEffect(() => {
    let alive = true;
    apiJson("/api/users/admin/economy-scenario", { headers })
      .then((d: any) => { if (alive && d?.scenario) setRemote(d); })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const preset = ECONOMY_PRESETS[0];
  const info = remote?.scenario ?? preset;
  const summary: Array<{ label: string; value: string }> = remote?.scenario?.summary ?? [
    { label: "🏦 العرض", value: (preset.supply).toLocaleString("en-US") },
    { label: "⛏️ تعدين L1", value: `${preset.payload.levelPlan[0].miningRate} /ساعة` },
    { label: "⛏️ تعدين L9", value: `${preset.payload.levelPlan[8].miningRate} /ساعة` },
    { label: "🎁 XP مهمة", value: "0 (معطّل)" },
    { label: "🎰 عجلة", value: `${preset.payload.wheel.dailyCap} لفة/يوم` },
    { label: "💼 أنشطة", value: `${preset.payload.tokenomics[0].pct}%` },
  ];

  const apply = async () => {
    setBusy(true);
    setConfirming(null);
    try {
      const res = await apiFetch("/api/users/admin/economy-scenario", {
        method: "POST",
        headers,
        body: JSON.stringify({ confirm: true, stopTasks }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "فشل تطبيق السيناريو");
      setResult(data);
      toast.success(data.message || "تم تطبيق السيناريو ✅");
    } catch (e: any) {
      toast.error(e?.message || "فشل تطبيق السيناريو");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.card}>
      <h3 style={S.title}>🎯 سيناريو الاقتصاد المُحسوب</h3>
      <p style={S.desc}>
        {info.desc} بعد التطبيق <strong>تظل كل القيم قابلة للتعديل</strong> من تبويباتها كالمعتاد.
      </p>

      <div style={S.row}>
        {summary.map((s, i) => (
          <span key={i} style={S.chip}>{s.label}: {s.value}</span>
        ))}
      </div>

      {remote?.current && (
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8, marginBottom: 10 }}>
          الحالي الآن: العرض {Number(remote.current.tokenSupply || 0).toLocaleString("en-US")} · معدّل L1 {remote.current.miningRateL1} · XP مهمة {remote.current.xpTask}
        </div>
      )}

      {confirming ? (
        <div style={S.warn}>
          ⚠️ <strong>تأكيد:</strong> سيُستبدل العرض وخطة المستويات والبونص والعجلة وألعاب المهارة
          والبطاقات واقتصاديات التوكن بالقيم أعلاه. (رسوم التفعيل وال ICO واسم المشروع والشبكة لا تتغيّر.)
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={apply} disabled={busy} style={{ padding: "9px 16px", fontSize: 12.5, fontWeight: 800, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", cursor: busy ? "wait" : "pointer" }}>
              {busy ? "… جارٍ التطبيق" : "✅ نعم، طبّق"}
            </button>
            <button onClick={() => setConfirming(null)} style={{ padding: "9px 14px", fontSize: 12.5, borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: C.muted, cursor: "pointer" }}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(preset.id)} disabled={busy} style={{ padding: "10px 18px", fontSize: 12.5, fontWeight: 800, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", cursor: busy ? "wait" : "pointer" }}>
          ⚡ تطبيق السيناريو
        </button>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, cursor: "pointer", marginTop: 10 }}>
        <input type="checkbox" checked={stopTasks} onChange={(e) => setStopTasks(e.target.checked)} />
        إيقاف مهام المجتمع (مكافأة 0) مع التطبيق — ليبقى الإصدار مطابقاً للسيناريو
      </label>

      {result && (
        <div style={S.applied}>
          ✅ مُطبَّق: العرض {Number(result.tokenSupply).toLocaleString("en-US")} · {result.levelCount} مستويات ·
          تعدين {result.miningRateL1} → {result.miningRateMax} /ساعة · XP مهمة {result.xpTask} ·
          مهام موقوفة {result.stoppedTasks} قناة.
        </div>
      )}
    </div>
  );
}
