// src/components/CommunityTasksPanel.tsx
// 🎯 إدارة حسابات المجتمعات (المؤسسة) + التحقق اليدوي من اشتراك المستخدم قبل منح المكافأة
import React, { useEffect, useState } from "react";
import { C, font } from "../theme";

interface Props {
  token: string;
}

interface PendingTask {
  id: number;
  socialUsername: string;
  rewardClaimed: number;
  createdAt: string;
  user: { email: string; walletAddress: string | null; name: string | null };
  channel: { title: string; link: string; platform: string } | null;
}

const PLATFORMS = [
  { value: "telegram", label: "Telegram", icon: "✈️" },
  { value: "x", label: "X (Twitter)", icon: "🐦" },
  { value: "discord", label: "Discord", icon: "🎮" },
  { value: "website", label: "موقع / ويب", icon: "🌐" },
];
const platformLabel = (p: string) => PLATFORMS.find((x) => x.value === p)?.label || p;
const platformIcon = (p: string) => PLATFORMS.find((x) => x.value === p)?.icon || "📢";

export default function CommunityTasksPanel({ token }: Props) {
  const [channels, setChannels] = useState<any[]>([]);
  const [pending, setPending] = useState<PendingTask[]>([]);
  const [form, setForm] = useState({ title: "", platform: "telegram", link: "", reward: "10" });
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);

  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  const loadAll = async () => {
    try {
      const [ch, pd] = await Promise.all([
        fetch("/api/tasks/admin/channels", { headers }).then((r) => r.json()),
        fetch("/api/tasks/admin/pending", { headers }).then((r) => r.json()),
      ]);
      setChannels(Array.isArray(ch) ? ch : []);
      setPending(Array.isArray(pd) ? pd : []);
    } catch {
      setStatus({ type: "error", text: "تعذر جلب بيانات المجتمعات" });
    }
  };

  useEffect(() => { loadAll(); }, []);

  const addChannel = async () => {
    if (!form.title.trim() || !form.link.trim()) {
      return setStatus({ type: "error", text: "أدخل اسم الحساب والرابط أولاً" });
    }
    try {
      setSaving(true);
      const res = await fetch("/api/tasks/admin/channels", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: form.title.trim(), platform: form.platform, link: form.link.trim(), reward: Number(form.reward) || 10 }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: "تمت إضافة الحساب المجتمعي بنجاح ✅" });
        setForm({ title: "", platform: "telegram", link: "", reward: "10" });
        loadAll();
      } else {
        setStatus({ type: "error", text: data.message || "فشل إضافة الحساب" });
      }
    } catch {
      setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = async (id: number, active: boolean) => {
    const ch = channels.find((c) => c.id === id);
    if (!ch) return;
    try {
      const res = await fetch(`/api/tasks/admin/channels/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ title: ch.title, platform: ch.platform, link: ch.link, reward: Number(ch.reward), active }),
      });
      if (res.ok) { setStatus({ type: "success", text: active ? "تم تفعيل الحساب ✅" : "تم إيقاف الحساب ⏸️" }); loadAll(); }
    } catch {
      setStatus({ type: "error", text: "فشل تحديث الحالة" });
    }
  };

  const deleteChannel = async (id: number) => {
    if (!window.confirm("حذف هذا الحساب المجتمعي؟ ستبقى المكافآت الممنوحة سابقاً محفوظة.")) return;
    try {
      const res = await fetch(`/api/tasks/admin/channels/${id}`, { method: "DELETE", headers });
      if (res.ok) { setStatus({ type: "success", text: "تم حذف الحساب" }); loadAll(); }
    } catch {
      setStatus({ type: "error", text: "فشل حذف الحساب" });
    }
  };

  const decideTask = async (id: number, action: "approve" | "reject") => {
    try {
      setProcessingId(id);
      const res = await fetch(`/api/tasks/admin/${action}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ taskId: id }),
      });
      const data = await res.json();
      setStatus(res.ok ? { type: "success", text: data.message } : { type: "error", text: data.message || "فشل العملية" });
      loadAll();
    } catch {
      setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" });
    } finally {
      setProcessingId(null);
    }
  };

  const statusStyle: React.CSSProperties = status?.type === "error"
    ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
    : status?.type === "success"
      ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
      : { background: "rgba(0,255,204,0.08)", borderColor: "rgba(0,255,204,0.25)", color: C.teal };

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>🎯 مهام المجتمع والتحقق من الاشتراك</h1>
        <p style={styles.subtitle}>أضف حسابات المؤسسة (Telegram / X / Discord...) التي يجب الاشتراك بها، ثم تحقق يدوياً من أن المستخدم مشترك فعلاً قبل منحه المكافأة.</p>
      </div>

      {status && (
        <div style={{ ...styles.statusBox, ...statusStyle }}>
          {status.text}
        </div>
      )}

      {/* ➕ إضافة حساب مجتمعي جديد */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>➕ إضافة حساب مجتمعي جديد</h3>
        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>اسم الحساب</label>
            <input
              className="input"
              type="text"
              placeholder="مثال: قناة Telegram الرسمية"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>المنصة</label>
            <select className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} style={styles.input}>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
              ))}
            </select>
          </div>
          <div style={{ ...styles.field, flex: 2 }}>
            <label style={styles.label}>رابط الاشتراك</label>
            <input
              className="input"
              type="text"
              placeholder="https://t.me/solkit_official"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              style={{ ...styles.input, direction: "ltr", textAlign: "left" }}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>المكافأة (SOLKIT)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={form.reward}
              onChange={(e) => setForm({ ...form, reward: e.target.value })}
              style={styles.input}
            />
          </div>
          <button onClick={addChannel} disabled={saving} className="btn btn-primary" style={styles.addBtn}>
            {saving ? "جاري الإضافة..." : "إضافة الحساب 💾"}
          </button>
        </div>
      </div>

      {/* 📋 الحسابات المجتمعية الحالية */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>📋 حسابات المجتمعات الحالية</h3>
        {channels.length === 0 ? (
          <p style={styles.noData}>لا توجد حسابات مضافة بعد — أضف أول حساب من الأعلى.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>الحساب</th>
                  <th style={styles.th}>المنصة</th>
                  <th style={styles.th}>المكافأة</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} style={styles.tdRow}>
                    <td style={{ ...styles.td, fontWeight: 800 }}>{c.title}</td>
                    <td style={styles.td}>{platformIcon(c.platform)} {platformLabel(c.platform)}</td>
                    <td style={{ ...styles.td, color: C.teal, fontWeight: 800 }}>+{Number(c.reward).toFixed(2)}</td>
                    <td style={styles.td}>
                      <span className="pill" style={c.active
                        ? { background: "rgba(0,255,119,0.12)", color: "#00ff77", border: "1px solid rgba(0,255,119,0.25)", padding: "5px 12px", fontSize: 11 }
                        : { background: "rgba(139,147,171,0.12)", color: C.muted, border: "1px solid rgba(139,147,171,0.25)", padding: "5px 12px", fontSize: 11 }}>
                        {c.active ? "فعّال 🟢" : "متوقف ⏸️"}
                      </span>
                    </td>
                    <td style={styles.tdActions}>
                      <button onClick={() => toggleChannel(c.id, !c.active)} className="btn btn-ghost" style={styles.smallBtn}>
                        {c.active ? "إيقاف" : "تفعيل"}
                      </button>
                      <button onClick={() => deleteChannel(c.id)} style={styles.delBtn}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ✅ طلبات التحقق المعلقة */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>
          ✅ طلبات التحقق المعلقة {pending.length > 0 && <span className="pill" style={styles.badge}>{pending.length}</span>}
        </h3>
        {pending.length === 0 ? (
          <p style={styles.noData}>لا توجد طلبات تحقق معلقة حالياً. 🎉</p>
        ) : (
          <div style={styles.pendingList}>
            {pending.map((p) => (
              <div key={p.id} style={styles.pendingItem}>
                <div style={styles.pendingInfo}>
                  <span style={styles.userBadge}>{platformIcon(p.channel?.platform || "")} {p.channel?.title || "حساب"}</span>
                  <span style={styles.userText}>{p.user.email || "مستخدم"}</span>
                  <code style={styles.username}>@{p.socialUsername}</code>
                  <span style={styles.pendingMeta}>
                    مكافأة <strong style={{ color: C.teal }}>+{Number(p.rewardClaimed).toFixed(2)}</strong> • {new Date(p.createdAt).toLocaleString("ar-EG")}
                  </span>
                </div>
                <div style={styles.pendingActions}>
                  <a href={p.channel?.link} target="_blank" rel="noreferrer" className="btn btn-ghost" style={styles.smallBtn}>فتح الحساب 🔗</a>
                  <button onClick={() => decideTask(p.id, "approve")} disabled={processingId === p.id} className="btn btn-green" style={styles.smallBtn}>تأكيد الاشتراك ✓</button>
                  <button onClick={() => decideTask(p.id, "reject")} disabled={processingId === p.id} style={styles.delBtn}>رفض ✗</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", direction: "rtl", fontFamily: font },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 1.8 },
  statusBox: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,255,204,0.25)", fontSize: 13, lineHeight: 1.7, textAlign: "right" },
  card: { padding: 24 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  badge: { background: "rgba(255,176,32,0.15)", color: C.amber, border: "1px solid rgba(255,176,32,0.35)", padding: "2px 10px", fontSize: 11, marginInlineStart: 8 },
  formGrid: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 150 },
  label: { color: C.muted, fontSize: 12, fontWeight: 700 },
  input: { width: "100%", padding: "10px 12px", fontSize: 13, boxSizing: "border-box" },
  addBtn: { padding: "10px 22px", fontSize: 13, whiteSpace: "nowrap", height: 42 },
  noData: { color: C.muted, textAlign: "center", fontSize: 13, margin: "18px 0" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 },
  thRow: { borderBottom: "1px solid rgba(255,255,255,0.12)" },
  th: { color: C.muted, padding: "12px 8px", fontWeight: 700 },
  tdRow: { borderBottom: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "14px 8px", color: C.text },
  tdActions: { padding: "14px 8px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  smallBtn: { padding: "7px 12px", fontSize: 11.5, whiteSpace: "nowrap" },
  delBtn: { borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,77,77,0.4)", background: "rgba(255,77,77,0.15)", color: "#ff4d4d", fontFamily: font, whiteSpace: "nowrap" },
  pendingList: { display: "flex", flexDirection: "column", gap: 10 },
  pendingItem: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  pendingInfo: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  userBadge: { fontSize: 13, fontWeight: 800, color: C.text },
  userText: { color: C.muted, fontSize: 12 },
  username: { color: C.teal, fontFamily: "monospace", fontSize: 12.5, fontWeight: 800, background: "rgba(0,255,204,0.08)", border: "1px solid rgba(0,255,204,0.2)", borderRadius: 8, padding: "4px 10px", alignSelf: "flex-start" },
  pendingMeta: { color: C.faint, fontSize: 11 },
  pendingActions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
};
