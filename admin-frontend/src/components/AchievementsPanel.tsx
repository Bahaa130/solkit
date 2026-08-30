import { apiFetch } from "../lib/api";
// src/components/AchievementsPanel.tsx
// 🏅 منح الإنجازات يدوياً من المدير — المكافأة تُضاف للرصيد الداخلي للمستخدم فوراً
import React, { useEffect, useState } from "react";
import { C, font } from "../theme";

interface Props {
  token: string;
}

interface SearchUser {
  id: number;
  name: string | null;
  email: string | null;
  walletAddress: string | null;
  referralCode: string | null;
  activationStatus: string;
  currentLevel: number;
  balance: number;
  streakDay: number;
  approvedTasks: number;
  games7: number;
  gamesTotal: number;
  activeFriends: number;
}

interface Achieve {
  id: number;
  userId: number;
  type: string;
  target: string;
  reward: number;
  note: string | null;
  grantedBy: string;
  createdAt: string;
  user?: { id: number; name: string | null; email: string | null; walletAddress: string | null; referralCode: string | null };
}

const ACH_TYPES: { key: string; icon: string; label: string; hint: string }[] = [
  { key: "mining_points", icon: "⛏️", label: "بلوغ عدد نقاط التعدين", hint: "مثال: 10,000" },
  { key: "bonus_week", icon: "🎁", label: "المكافأة اليومية — إكمال أسبوع كامل", hint: "7 أيام متتالية" },
  { key: "community_tasks", icon: "✅", label: "إكمال عدد من المهام المجتمعية", hint: "مثال: 5 مهام معتمدة" },
  { key: "games_week", icon: "🎮", label: "عدد مرات اللعب في الأسبوع", hint: "مثال: 10 جولات" },
  { key: "active_friends", icon: "👥", label: "عدد الأصدقاء الفعّالين", hint: "مثال: 5 أصدقاء" },
];

const typeIcon = (type: string) => ACH_TYPES.find((x) => x.key === type)?.icon || "🏅";
const typeLabel = (type: string) => ACH_TYPES.find((x) => x.key === type)?.label || "إنجاز";
const short = (w?: string | null) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || "—"));

export default function AchievementsPanel({ token }: Props) {
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [form, setForm] = useState({ type: "mining_points", target: "", reward: "0", note: "" });
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<Achieve[]>([]);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);
  const [tab, setTab] = useState<"grant" | "logs">("grant");

  const loadList = async () => {
    try {
      const res = await apiFetch("/api/users/admin/achievements", { headers });
      const d = await res.json();
      setList(Array.isArray(d) ? d : []);
    } catch { /* تجاهل */ }
  };

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setUsers([]); return; }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await apiFetch(`/api/users/admin/achievements/search?q=${encodeURIComponent(q.trim())}`, { headers });
        const d = await res.json();
        setUsers(Array.isArray(d) ? d : []);
      } catch { setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" }); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [q]);

  const grant = async () => {
    if (!selected) { setStatus({ type: "error", text: "اختر المستخدم المستحق أولاً من نتائج البحث" }); return; }
    const reward = Number(form.reward);
    if (!Number.isFinite(reward) || reward <= 0) { setStatus({ type: "error", text: "أدخل قيمة مكافأة صحيحة أكبر من الصفر" }); return; }
    try {
      setSaving(true);
      const res = await apiFetch("/api/users/admin/achievements", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: selected.id, type: form.type, target: form.target, reward, note: form.note }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: data.message || "تم منح الإنجاز وإضافة المكافأة ✅" });
        setForm({ type: "mining_points", target: "", reward: "0", note: "" });
        setUsers((prev) => prev.map((u) => (u.id === selected.id ? { ...u, balance: Number(u.balance) + reward } : u)));
        setSelected((s) => (s ? { ...s, balance: Number(s.balance) + reward } : s));
        loadList();
      } else {
        setStatus({ type: "error", text: data.message || "فشل منح الإنجاز" });
      }
    } catch {
      setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" });
    } finally {
      setSaving(false);
    }
  };

  const removeAchievement = async (id: number) => {
    if (!window.confirm("حذف هذا الإنجاز؟ (لا يسحب المكافأة تلقائياً من الرصيد)")) return;
    try {
      const res = await apiFetch(`/api/users/admin/achievements/${id}`, { method: "DELETE", headers });
      const data = await res.json();
      setStatus(res.ok ? { type: "success", text: data.message } : { type: "error", text: data.message || "فشل الحذف" });
      loadList();
    } catch {
      setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" });
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
        <h1 style={styles.title}>🏅 الإنجازات والمكافآت اليدوية</h1>
        <p style={styles.subtitle}>
          ابحث عن المستخدم، راجع عدّادات تقدمه الحية، ثم امنحهُ إنجازاً يدوياً وتُضاف مكافأته فوراً إلى رصيده الداخلي
          (تزيد حصته في التوزيع القادم). القرار والتحقق مسؤوليتك يدوياً — النظام لا يمنح أي شيء تلقائياً.
        </p>
      </div>

      {status && (
        <div style={{ ...styles.statusBox, ...statusStyle }}>
          {status.text}
        </div>
      )}

      <div style={styles.tabs}>
        {[["grant", "🎯 منح إنجاز"], ["logs", "📋 سجل الإنجازات"]].map(([k, lab]) => (
          <button key={k} onClick={() => setTab(k as any)} className="btn btn-ghost" style={{ ...styles.tabBtn, ...(tab === k ? { background: "rgba(0,255,204,0.12)", color: C.teal, borderColor: "rgba(0,255,204,0.4)" } : {}) }}>
            {lab}
          </button>
        ))}
      </div>

      {tab === "grant" && (
        <>
          {/* 🔍 البحث عن المستخدم */}
          <div className="glass" style={styles.card}>
            <h3 style={styles.cardTitle}>🔍 البحث عن المستخدم</h3>
            <input
              className="input"
              type="text"
              style={{ ...styles.input, width: "100%", maxWidth: 420 }}
              placeholder="ابحث بالبريد أو المحفظة أو رمز الإحالة أو الاسم (حرفان على الأقل)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <p style={styles.noData}>جارِ البحث...</p>}
            {!searching && users.length > 0 && (
              <div style={styles.userList}>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u)}
                    style={{ ...styles.userCard, ...(selected?.id === u.id ? { borderColor: C.teal, boxShadow: "0 0 14px rgba(0,255,204,0.25)" } : {}) }}
                  >
                    <div style={styles.userHeader}>
                      <span style={styles.userName}>{u.name || u.email || "مستخدم"}</span>
                      <span className="pill" style={u.activationStatus === "active"
                        ? { background: "rgba(0,255,119,0.12)", color: "#00ff77", border: "1px solid rgba(0,255,119,0.25)", padding: "2px 8px", fontSize: 10 }
                        : { background: "rgba(139,147,171,0.12)", color: C.muted, border: "1px solid rgba(139,147,171,0.25)", padding: "2px 8px", fontSize: 10 }}>
                        {u.activationStatus === "active" ? "فعّال 🟢" : "غير مفعّل"}
                      </span>
                    </div>
                    <div style={styles.userMeta}>
                      <code style={styles.code}>{u.email || short(u.walletAddress)}</code>
                      <code style={styles.code}>#{u.referralCode || "—"}</code>
                    </div>
                    <div style={styles.counters}>
                      <span style={styles.counter}>💎 الرصيد <b>{Number(u.balance).toFixed(2)}</b></span>
                      <span style={styles.counter}>🎁 سلسلة البونص <b>{u.streakDay}</b></span>
                      <span style={styles.counter}>✅ مهام معتمدة <b>{u.approvedTasks}</b></span>
                      <span style={styles.counter}>🎮 ألعاب(أسبوع) <b>{u.games7}</b></span>
                      <span style={styles.counter}>👥 أصدقاء فعّالون <b>{u.activeFriends}</b></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!searching && q.trim().length >= 2 && users.length === 0 && (
              <p style={styles.noData}>لا توجد نتائج مطابقة للبحث.</p>
            )}
          </div>

          {/* 🎁 نموذج منح الإنجاز */}
          {selected && (
            <div className="glass" style={styles.card}>
              <h3 style={styles.cardTitle}>
                🎁 منح الإنجاز لـ: <span style={{ color: C.teal }}>{selected.name || selected.email || `#${selected.id}`}</span>
              </h3>
              <div style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>نوع الإنجاز</label>
                  <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={styles.input}>
                    {ACH_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>ما الذي تحققه؟ (وصف الإنجاز)</label>
                  <input
                    className="input"
                    type="text"
                    style={styles.input}
                    placeholder={ACH_TYPES.find((t) => t.key === form.type)?.hint}
                    value={form.target}
                    onChange={(e) => setForm({ ...form, target: e.target.value })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>قيمة المكافأة (توكن سولكيت — تُضاف للرصيد الداخلي)</label>
                  <input
                    className="input"
                    type="number"
                    min="0.00000001"
                    step="0.1"
                    style={styles.input}
                    value={form.reward}
                    onChange={(e) => setForm({ ...form, reward: e.target.value })}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>ملاحظة (اختياري)</label>
                  <input
                    className="input"
                    type="text"
                    style={styles.input}
                    placeholder="مثال: أتم 10,000 نقطة تعدين"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
              </div>
              <div style={styles.grantRow}>
                <button onClick={grant} disabled={saving} className="btn btn-primary" style={styles.grantBtn}>
                  {saving ? "جارِ المنح..." : "🪙 منح الإنجاز وإضافة المكافأة"}
                </button>
                <span style={styles.grantHint}>تُضاف فوراً إلى رصيد {selected?.name || "المستخدم"} الداخلي وتظهر له في صفحة «المستويات».</span>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "logs" && (
        <div className="glass" style={styles.card}>
          <h3 style={styles.cardTitle}>📋 سجل الإنجازات الممنوحة</h3>
          {list.length === 0 ? (
            <p style={styles.noData}>لا توجد إنجازات ممنوحة بعد.</p>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>الإنجاز</th>
                    <th style={styles.th}>المستخدم</th>
                    <th style={styles.th}>المكافأة</th>
                    <th style={styles.th}>التاريخ</th>
                    <th style={styles.th}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 40).map((a) => (
                    <tr key={a.id} style={styles.tdRow}>
                      <td style={{ ...styles.td, fontWeight: 800 }}>{typeIcon(a.type)} {typeLabel(a.type)}<div style={styles.tdSub}>{a.target}</div></td>
                      <td style={styles.td}>
                        {a.user?.name || a.user?.email || short(a.user?.walletAddress)}
                        <div style={styles.tdSub}>#{a.user?.referralCode || "—"}</div>
                      </td>
                      <td style={{ ...styles.td, color: C.teal, fontWeight: 800 }}>+{Number(a.reward).toFixed(2)}</td>
                      <td style={{ ...styles.td, fontSize: 11.5 }}>{new Date(a.createdAt).toLocaleString("ar-EG")}</td>
                      <td style={styles.tdActions}>
                        <button onClick={() => removeAchievement(a.id)} style={styles.delBtn}>حذف</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", direction: "rtl", fontFamily: font, width: "100%", minWidth: 0, boxSizing: "border-box" },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 1.8 },
  statusBox: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,255,204,0.25)", fontSize: 13, lineHeight: 1.7, textAlign: "right" },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tabBtn: { padding: "9px 16px", fontSize: 13, whiteSpace: "nowrap", borderRadius: 12 },
  card: { padding: 24 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  input: { width: "100%", padding: "10px 12px", fontSize: 13, boxSizing: "border-box" },
  noData: { color: C.muted, textAlign: "center", fontSize: 13, margin: "18px 0" },
  userList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 16 },
  userCard: { textAlign: "right", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px", cursor: "pointer", width: "100%", fontFamily: font, display: "flex", flexDirection: "column", gap: 8 },
  userHeader: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  userName: { color: C.text, fontWeight: 800, fontSize: 14 },
  userMeta: { display: "flex", gap: 10, flexWrap: "wrap" },
  code: { color: C.muted, fontFamily: "monospace", fontSize: 11.5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "2px 8px" },
  counters: { display: "flex", gap: 8, flexWrap: "wrap" },
  counter: { fontSize: 11, color: C.muted, background: "rgba(0,255,204,0.06)", border: "1px solid rgba(0,255,204,0.15)", borderRadius: 999, padding: "4px 10px" },
  formGrid: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 170 },
  label: { color: C.muted, fontSize: 12, fontWeight: 700 },
  grantRow: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16 },
  grantBtn: { padding: "11px 24px", fontSize: 13.5, whiteSpace: "nowrap" },
  grantHint: { color: C.faint, fontSize: 11.5, flex: 1, minWidth: 200 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 },
  thRow: { borderBottom: "1px solid rgba(255,255,255,0.12)" },
  th: { color: C.muted, padding: "12px 8px", fontWeight: 700 },
  tdRow: { borderBottom: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "14px 8px", color: C.text },
  tdSub: { fontSize: 11, color: C.faint, marginTop: 3, fontWeight: 400 },
  tdActions: { padding: "14px 8px" },
  delBtn: { borderRadius: 8, padding: "7px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,77,77,0.4)", background: "rgba(255,77,77,0.15)", color: "#ff4d4d", fontFamily: font, whiteSpace: "nowrap" },
};