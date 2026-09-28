// admin-frontend/src/components/EconomyPresetPanel.tsx
// 🎯 تطبيق سيناريو اقتصاد مُحسوب بضغطة واحدة — ثم كل حقل يظل قابلاً للتعديل من اللوحة
import React, { useState } from "react";
import { apiFetch } from "../lib/api";
import { ECONOMY_PRESETS, getPreset } from "../lib/economyPresets";
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
  row: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    fontSize: 11.5, padding: "5px 10px", borderRadius: 999,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: C.text,
  },
  warn: {
    fontSize: 12, lineHeight: 1.7, padding: "10px 12px", borderRadius: 12, marginBottom: 12,
    background: "rgba(255,176,32,0.08)", border: "1px solid rgba(255,176,32,0.3)", color: "#ffcf7a",
  },
};

export default function EconomyPresetPanel({ token }: { token: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [stopTasks, setStopTasks] = useState(true);

  const apply = async (id: string) => {
    const preset = getPreset(id);
    if (!preset) return;
    setBusy(true);
    setConfirming(null);
    try {
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      // 1️⃣ الإعدادات (عرض + مستويات + بونص + عجلة + ألعاب + توكنوميكس + بطاقات)
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify(preset.payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "فشل حفظ الإعدادات");
      }

      // 2️⃣ المهام: تصفير المكافآت وإيقافها (0 = لا إصدار توكنات من المهام)
      let taskMsg = "";
      if (stopTasks) {
        try {
          const list = await apiFetch("/api/tasks/admin/channels", { headers });
          const arr: any[] = Array.isArray(list) ? list : [];
          let n = 0;
          for (const c of arr) {
            const r = await apiFetch(`/api/tasks/admin/channels/${c.id}`, {
              method: "PUT",
              headers,
              body: JSON.stringify({ title: c.title, platform: c.platform, link: c.link, reward: 0, active: false, sortOrder: c.sortOrder ?? 0 }),
            });
            if (r.ok) n++;
          }
          taskMsg = ` · المهام: أُوقفت ${n} قناة (مكافأة 0)`;
        } catch {
          taskMsg = " · ⚠️ تعذّر تحديث المهام";
        }
      }

      toast.success(`تم تطبيق سيناريو «${preset.name}» ✅${taskMsg}`);
    } catch (e: any) {
      toast.error(e?.message || "فشل تطبيق السيناريو");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.card}>
      <h3 style={S.title}>🎯 سيناريوهات الاقتصاد المُحسوبة</h3>
      <p style={S.desc}>
        كل سيناريو распредеلاته محسوبة من معادلة ميزانية الإصدار (عرض × نسبة مخصّصة ÷ مدة المشروع ÷ عدد المستخدمين).
        بعد التطبيق <strong>تظل كل القيم قابلة للتعديل</strong> من تبويباتها كالمعتاد.
      </p>

      {ECONOMY_PRESETS.map((p) => (
        <div key={p.id} style={{ marginBottom: 10, padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.teal, marginBottom: 4 }}>{p.name}</div>
          <div style={{ ...S.desc, margin: "0 0 8px" }}>{p.desc}</div>
          <div style={S.row}>
            <span style={S.chip}>🏦 العرض: {p.supply.toLocaleString("en-US")}</span>
            <span style={S.chip}>⛏️ تعدين L1: {p.payload.levelPlan[0].miningRate} /ساعة</span>
            <span style={S.chip}>📈 L9: {p.payload.levelPlan[8].miningRate} /ساعة</span>
            <span style={S.chip}>🎁Xp مهمة: 0 (معطّلة)</span>
            <span style={S.chip}>🎰 عجلة: {p.payload.wheel.dailyCap} لفة/يوم</span>
            <span style={S.chip}>💼 أنشطة: {p.payload.tokenomics[0].pct}%</span>
          </div>

          {confirming === p.id ? (
            <div style={S.warn}>
              ⚠️ <strong>تأكيد:</strong> سيُستبدل العرض وخطة المستويات والبونص والعجلة وألعاب المهارة
              والبطاقات واقتصاديات التوكن بالقيم أعلاه. (رسوم التفعيل وال ICO والاسم والشبكة لا تتغيّر.)
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={() => apply(p.id)} disabled={busy} className="btn btn-purple" style={{ padding: "9px 16px", fontSize: 12.5, fontWeight: 800 }}>
                  {busy ? "… جارٍ التطبيق" : "✅ نعم، طبّق"}
                </button>
                <button onClick={() => setConfirming(null)} className="btn btn-ghost" style={{ padding: "9px 14px", fontSize: 12.5 }}>
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirming(p.id)} disabled={busy} className="btn btn-purple" style={{ padding: "10px 18px", fontSize: 12.5, fontWeight: 800 }}>
              ⚡ تطبيق هذا السيناريو
            </button>
          )}
        </div>
      ))}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, cursor: "pointer" }}>
        <input type="checkbox" checked={stopTasks} onChange={(e) => setStopTasks(e.target.checked)} />
        إيقاف مهام المجتمع (مكافأة 0) مع التطبيق — ليبقى الإصدار مطابقاً للسيناريو
      </label>
    </div>
  );
}
