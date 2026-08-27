import { apiFetch } from "../lib/api";
// src/pages/TasksPage.tsx
// 🎯 المهام الاجتماعية: اشترك في حسابات المجتمعات الرسمية، أدخل اسم حسابك، وتنتظر مراجعة الإدارة قبل منح المكافأة
import React, { useCallback, useEffect, useState } from "react";
import { C, styles as T } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useBranding } from "../branding";
import { useToast } from "../components/Toast";

interface TasksPageProps { userId: number; token: string; }

interface ChannelItem {
  id: number;
  title: string;
  platform: string;
  link: string;
  reward: number;
  userStatus: "pending" | "approved" | "rejected" | null;
  socialUsername: string | null;
}

const PLATFORM_ICONS: Record<string, string> = { telegram: "✈️", x: "🐦", discord: "🎮", website: "🌐" };
const platformIcon = (p: string) => PLATFORM_ICONS[p] || "📢";

// 🔧 تحويل أي رابط مخزّن (قد يفتقر لبروتوكول) إلى رابط مطلق http(s) صالح
const normalizeLink = (link: string): string => {
  const clean = (link || "").trim();
  if (!clean) return "#";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
};

export default function TasksPage({ token }: TasksPageProps) {
  const { dir, t } = useLang();
  const { branding } = useBranding();
  const toast = useToast();
  const [channels, setChannels] = useState<ChannelItem[] | null>(null);
  const [usernames, setUsernames] = useState<Record<number, string>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadTasks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/tasks/list", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      setChannels(res.ok ? (data.channels || []) : []);
    } catch {
      setChannels([]);
    }
  }, [token]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleVerify = async (channel: ChannelItem) => {
    const username = (usernames[channel.id] || "").trim();
    if (!username) return toast.warning(t("tasks.toastNoUsername"));
    try {
      setSubmittingId(channel.id);
      const res = await apiFetch("/api/tasks/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ channelId: channel.id, socialUsername: username })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || t("tasks.toastSuccess"));
        loadTasks();
      } else {
        toast.warning(data.message || t("tasks.toastInvalid"));
      }
    } catch {
      toast.error(t("tasks.toastError"));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div style={{ ...T.page, direction: dir, maxWidth: 600 }}>
      <h2 style={styles.heading}>{t("tasks.heading")}</h2>
      <p style={styles.sub}>{t("tasks.sub")}</p>

      {channels === null ? (
        <p style={{ color: C.muted, textAlign: "center", padding: 24, fontSize: 13 }}>{t("common.loading")}</p>
      ) : channels.length === 0 ? (
        <p style={{ color: C.muted, textAlign: "center", padding: 24, fontSize: 13 }}>{t("tasks.noTasks")}</p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {channels.map((channel) => {
            const approved = channel.userStatus === "approved";
            const pending = channel.userStatus === "pending";
            const rejected = channel.userStatus === "rejected";
            const href = normalizeLink(channel.link);
            const displayLink = channel.link.replace(/^https?:\/\//i, "");
            return (
              <div key={channel.id} className="glass" style={styles.taskCard}>
                {/* رأس البطاقة: الأيقونة + العنوان + مكافأة */}
                <div style={styles.taskHead}>
                  <span style={styles.taskIcon}>{platformIcon(channel.platform)}</span>
                  <div style={styles.taskHeadText}>
                    <h4 style={styles.taskTitle}>{channel.title}</h4>
                    <span style={styles.taskReward}>+{channel.reward.toFixed(2)} {branding.tokenSymbol}</span>
                  </div>
                  {approved ? (
                    <span className="pill" style={styles.approvedPill}>✅ {t("tasks.doneBtn")}</span>
                  ) : pending ? (
                    <span className="pill" style={styles.pendingPill}>⏳ {t("tasks.pending")}</span>
                  ) : rejected ? (
                    <span className="pill" style={styles.rejectedPill}>⚠️ {t("tasks.rejected")}</span>
                  ) : null}
                </div>

                {/* معاينة الرابط الحقيقي الذي وضعه المدير */}
                <div style={styles.linkPreview} title={href}>
                  🔗 <span style={styles.linkText}>{displayLink || href}</span>
                </div>

                {/* زر الانضمام: يفتح الرابط الحقيقي في تبويب جديد */}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={styles.joinBtn}
                >
                  {t("tasks.joinNow")}
                </a>

                {/* نموذج التحقق (يظهر فقط لمن لم يكمل بعد) */}
                {!approved && !pending && (
                  <div style={styles.inputRow}>
                    <input
                      className="input"
                      type="text"
                      placeholder={t("tasks.usernamePlaceholder")}
                      value={usernames[channel.id] || ""}
                      onChange={(e) => setUsernames({ ...usernames, [channel.id]: e.target.value })}
                      style={styles.usernameInput}
                    />
                    <button
                      onClick={() => handleVerify(channel)}
                      disabled={submittingId === channel.id}
                      className="btn btn-primary"
                      style={styles.verifyBtn}
                    >
                      {submittingId === channel.id ? t("common.loading") : t("tasks.verifyBtn")}
                    </button>
                  </div>
                )}

                {pending && (
                  <p style={styles.hint}>⏳ {t("tasks.toastLink")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  heading: { textAlign: "center", fontSize: 21, fontWeight: 900, color: C.text, margin: 0 },
  sub: { textAlign: "center", color: C.muted, fontSize: 12.5, lineHeight: 1.9, maxWidth: 500, margin: "8px auto 0" },
  taskCard: { padding: 18, display: "flex", flexDirection: "column", gap: 14, borderRadius: 18 },
  taskHead: { display: "flex", alignItems: "center", gap: 14 },
  taskIcon: { fontSize: 30, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "rgba(124,92,255,0.12)", border: "1px solid rgba(124,92,255,0.25)", flexShrink: 0 },
  taskHeadText: { flex: 1, minWidth: 0 },
  taskTitle: { color: C.text, fontSize: 15, margin: 0, fontWeight: 800, lineHeight: 1.4 },
  taskReward: { color: C.teal, fontSize: 12.5, fontWeight: 800, marginTop: 3, display: "inline-block" },
  linkPreview: { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: C.faint, overflow: "hidden" },
  linkText: { color: C.muted, fontFamily: "monospace", direction: "ltr", textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  joinBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", fontSize: 13.5, fontWeight: 800, color: "#fff", background: "linear-gradient(135deg, #7c5cff, #5b8bff)", border: "none", borderRadius: 12, textDecoration: "none", boxShadow: "0 6px 18px rgba(124,92,255,0.28)" },
  inputRow: { display: "flex", gap: 10 },
  usernameInput: { flex: 1, padding: "11px 13px", fontSize: 13 },
  verifyBtn: { padding: "11px 18px", fontSize: 12.5, whiteSpace: "nowrap", fontWeight: 800 },
  hint: { color: C.amber, fontSize: 11.5, fontWeight: 700, textAlign: "center", margin: 0 },
  approvedPill: { background: "rgba(0,255,119,0.12)", color: "#00ff77", border: "1px solid rgba(0,255,119,0.25)", padding: "7px 14px", fontSize: 11.5, fontWeight: 800, borderRadius: 20, whiteSpace: "nowrap" },
  pendingPill: { background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.3)", padding: "7px 14px", fontSize: 11.5, fontWeight: 800, borderRadius: 20, whiteSpace: "nowrap" },
  rejectedPill: { background: "rgba(255,92,122,0.12)", color: C.red, border: "1px solid rgba(255,92,122,0.3)", padding: "7px 14px", fontSize: 11.5, fontWeight: 800, borderRadius: 20, whiteSpace: "nowrap" },
};
