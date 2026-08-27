import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font, styles as T } from "../theme";
import DistributionPanel from "../components/DistributionPanel";
import CommunityTasksPanel from "../components/CommunityTasksPanel";
import TokenSetupPanel from "../components/TokenSetupPanel";
import BrandingPanel from "../components/BrandingPanel";
import { useToast } from "../components/Toast";
import { useLang } from "../i18n/index.tsx";
import { useBranding } from "../branding";

interface AdminStats {
  totalUsers: number;
  activeMiners: number;
  totalRevenue: number;
}

type LevelRow = { level: number; name: string; minXp: number; color: string; miningRate: number };

// قمنا بتحديث المكون ليستقبل الـ token حياً من الأب الموثق 🛡️
export default function AdminPanelPage({ token }: { token: string }) {
  const { t, dir, lang } = useLang();
  const { branding } = useBranding();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<"general" | "distribution" | "tasks" | "token" | "branding" | "maintenance" | "airdrop" | "levels">("general");
  const [levelPlan, setLevelPlan] = useState<LevelRow[]>([]);
  // ⚙️ إعدادات الموقع (الصيانة + عدّاد TGE)
  const [settings, setSettings] = useState<{ maintenanceMode: boolean; maintenanceMessage: string; tgeTarget: number }>({
    maintenanceMode: false,
    maintenanceMessage: "",
    tgeTarget: 0,
  });
  const [tgeDays, setTgeDays] = useState<number>(30);
  const [savingSettings, setSavingSettings] = useState(false);
  const toast = useToast();

  // 1. دالة جلب البيانات والإحصائيات وتمرير التوكن الرسمي الصارم بـ Bearer JWT
  const fetchAdminData = async () => {
    if (!token) {
      setErrorMessage("عذراً، يجب تسجيل الدخول أولاً كمسؤول!");
      return;
    }

    try {
      setErrorMessage(null);
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` // تمرير التوكن المشفر المعتمد بدلاً من الهيدر البدائي القديم 🔐
      };

      // جلب الإحصائيات العامة من السيرفر الفولاذي
      const statsRes = await apiFetch("/api/users/admin/stats", { headers });

      if (statsRes.status === 401 || statsRes.status === 403) {
        setErrorMessage("عذراً، جلسة العمل منتهية أو حسابك لا يمتلك صلاحية المسؤول العليا!");
        return;
      }

      if (!statsRes.ok) {
        setErrorMessage("فشل السيرفر في معالجة طلب الإدارة الحية");
        return;
      }
      const statsData = await statsRes.json();

      setStats(statsData);

    } catch (error) {
      console.error("Error loading admin dashboard:", error);
      setErrorMessage("خطأ في الاتصال بالخادم، تأكد من تشغيل الـ Backend");
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [token]);

  // ⚙️ جلب إعدادات الموقع (الصيانة + عدّاد TGE)
  const fetchSettings = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await apiFetch("/api/users/settings", { headers });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          maintenanceMode: Boolean(data.maintenanceMode),
          maintenanceMessage: data.maintenanceMessage || "",
          tgeTarget: Number(data.tgeTarget || 0),
        });
        if (Array.isArray(data.levelPlan) && data.levelPlan.length) {
          setLevelPlan(data.levelPlan.map((l: LevelRow) => ({ ...l })));
        }
      }
    } catch { /* تجاهل */ }
  };

  useEffect(() => {
    fetchSettings();
  }, [token]);

  // ⚙️ حفظ وضع الصيانة (مستقل عن عدّاد الإيردروب)
  const saveMaintenance = async () => {
    try {
      setSavingSettings(true);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          maintenanceMode: settings.maintenanceMode,
          maintenanceMessage: settings.maintenanceMessage,
        }),
      });
      if (res.ok) {
        toast.success(t("admin.settingsSaved"));
        fetchSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || t("admin.settingsError"));
      }
    } catch {
      toast.error(t("admin.settingsError"));
    } finally {
      setSavingSettings(false);
    }
  };

  // ⏳ حفظ عدّاد الإيردروب (TGE) — قسم مستقل
  const saveAirdrop = async () => {
    try {
      setSavingSettings(true);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const targetTs = tgeDays > 0 ? Date.now() + tgeDays * 24 * 3600 * 1000 : 0;
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({ tgeTarget: targetTs }),
      });
      if (res.ok) {
        toast.success(t("admin.settingsSaved"));
        fetchSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || t("admin.settingsError"));
      }
    } catch {
      toast.error(t("admin.settingsError"));
    } finally {
      setSavingSettings(false);
    }
  };

  // 🏆 حفظ خطة المستويات
  const updateLevel = (i: number, key: keyof LevelRow, val: string | number) => {
    setLevelPlan((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  };

  const saveLevels = async () => {
    try {
      setSavingSettings(true);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({ levelPlan }),
      });
      if (res.ok) {
        toast.success(t("admin.levels.saved"));
        fetchSettings();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || t("admin.settingsError"));
      }
    } catch {
      toast.error(t("admin.settingsError"));
    } finally {
      setSavingSettings(false);
    }
  };

  if (errorMessage) {
    return (
      <div style={{ ...T.page, textAlign: "center", paddingTop: 80 }}>
        <h2 style={{ color: C.red, fontWeight: 900 }}>{errorMessage}</h2>
        <button onClick={fetchAdminData} className="btn btn-primary" style={{ marginTop: 20, padding: "12px 24px" }}>{t("common.retry")}</button>
      </div>
    );
  }

  if (!stats) return <div style={{ ...T.page, textAlign: "center", color: C.muted }}>{t("common.loading")}</div>;

  const statCards = [
    { label: t("admin.totalRevenue"), value: `${Number(stats.totalRevenue || 0).toFixed(3)}`, unit: t("admin.unitSOL"), color: C.amber, icon: "💰" },
    { label: t("admin.totalUsers"), value: `${stats.totalUsers}`, unit: t("admin.unitAccounts"), color: C.text, icon: "👥" },
    { label: t("admin.activeMiners"), value: `${stats.activeMiners}`, unit: t("admin.unitMiners"), color: C.teal, icon: "⛏️" },
  ];

  return (
    <div style={{ ...styles.container, direction: dir }}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>👑 {t("nav.admin")} — {branding.projectName}</h1>
      </div>

      <div style={styles.tabBar}>
        <button onClick={() => setAdminTab("general")} style={{ ...styles.tabBtn, ...(adminTab === "general" ? styles.tabActive : {}) }}>
          {t("admin.statsTitle")}
        </button>
        <button onClick={() => setAdminTab("distribution")} style={{ ...styles.tabBtn, ...(adminTab === "distribution" ? styles.tabActive : {}) }}>
          {t("admin.distTitle")}
        </button>
        <button onClick={() => setAdminTab("tasks")} style={{ ...styles.tabBtn, ...(adminTab === "tasks" ? styles.tabActive : {}) }}>
          {t("admin.tasksTitle")}
        </button>
        <button onClick={() => setAdminTab("token")} style={{ ...styles.tabBtn, ...(adminTab === "token" ? styles.tabActive : {}) }}>
          {t("token.tab")}
        </button>
        <button onClick={() => setAdminTab("branding")} style={{ ...styles.tabBtn, ...(adminTab === "branding" ? styles.tabActive : {}) }}>
          {t("nav.branding")}
        </button>
        <button onClick={() => setAdminTab("maintenance")} style={{ ...styles.tabBtn, ...(adminTab === "maintenance" ? styles.tabActive : {}) }}>
          {t("nav.maintenance")}
        </button>
        <button onClick={() => setAdminTab("airdrop")} style={{ ...styles.tabBtn, ...(adminTab === "airdrop" ? styles.tabActive : {}) }}>
          {t("nav.airdropCounter")}
        </button>
        <button onClick={() => setAdminTab("levels")} style={{ ...styles.tabBtn, ...(adminTab === "levels" ? styles.tabActive : {}) }}>
          {t("nav.levels")}
        </button>
      </div>

      {adminTab === "distribution" ? (
        <DistributionPanel token={token} />
      ) : adminTab === "tasks" ? (
        <CommunityTasksPanel token={token} />
      ) : adminTab === "token" ? (
        <TokenSetupPanel token={token} />
      ) : adminTab === "branding" ? (
        <BrandingPanel token={token} />
      ) : adminTab === "maintenance" ? (
        <div className="glass" style={styles.card}>
          <h3 style={styles.cardTitle}>{t("admin.maintenanceTitle")}</h3>
          <p style={{ ...styles.cardSub }}>
            {t("admin.maintenanceDesc")}
          </p>
          <label style={styles.toggleRow}>
            <span style={{ color: C.text, fontWeight: 800, fontSize: 13 }}>{t("admin.maintenanceEnable")}</span>
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
              style={{ width: 20, height: 20, accentColor: C.amber }}
            />
          </label>
          <textarea
            value={settings.maintenanceMessage}
            onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
            placeholder={t("admin.maintenanceMessagePlaceholder")}
            rows={3}
            style={{ ...styles.textarea, color: C.text }}
          />
          <button
            onClick={saveMaintenance}
            disabled={savingSettings}
            className="btn btn-primary"
            style={{ padding: "14px", fontSize: 14, fontWeight: 800, width: "100%", marginTop: 8 }}
          >
            {savingSettings ? t("admin.savingSettings") : t("admin.saveSettings")}
          </button>
        </div>
      ) : adminTab === "airdrop" ? (
        <div className="glass" style={styles.card}>
          <h3 style={styles.cardTitle}>{t("admin.tgeTitle")}</h3>
          <p style={{ ...styles.cardSub }}>
            {t("admin.tgeDesc")}
          </p>
          <div style={styles.tgeRow}>
            <label style={{ color: C.muted, fontSize: 13, fontWeight: 700 }}>
              {t("admin.tgeDaysLabel")}
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={tgeDays}
              onChange={(e) => setTgeDays(Math.max(0, Number(e.target.value) || 0))}
              style={{ ...styles.inputNum, color: C.text }}
            />
            <span style={{ color: C.muted, fontSize: 12 }}>{t("admin.tgeDaysSuffix")}</span>
          </div>
          <p style={{ color: C.faint, fontSize: 11.5, margin: "8px 0 0" }}>
            {settings.tgeTarget > 0
              ? t("admin.tgeCurrentTarget", { date: new Date(settings.tgeTarget).toLocaleString(lang === "ar" ? "ar-EG" : lang) })
              : t("admin.tgeNoTarget")}
          </p>
          <button
            onClick={saveAirdrop}
            disabled={savingSettings}
            className="btn btn-primary"
            style={{ padding: "14px", fontSize: 14, fontWeight: 800, width: "100%", marginTop: 8 }}
          >
            {savingSettings ? t("admin.savingSettings") : t("admin.saveSettings")}
          </button>
        </div>
      ) : adminTab === "levels" ? (
        <div className="glass" style={styles.card}>
          <h3 style={styles.cardTitle}>{t("admin.levels.title")}</h3>
          <p style={{ ...styles.cardSub }}>{t("admin.levels.desc")}</p>
          <div style={styles.lvlHead}>
            <span style={styles.lvlColNum}>#</span>
            <span style={{ ...styles.lvlCol, flex: 2 }}>{t("admin.levels.name")}</span>
            <span style={styles.lvlCol}>{t("admin.levels.minXp")}</span>
            <span style={styles.lvlCol}>{t("admin.levels.color")}</span>
            <span style={styles.lvlCol}>{t("admin.levels.rate")}</span>
          </div>
          {levelPlan.map((l, i) => (
            <div key={l.level} style={styles.lvlRow}>
              <span style={{ ...styles.lvlNum, color: l.color }}>{l.level}</span>
              <input value={l.name} onChange={(e) => updateLevel(i, "name", e.target.value)} style={{ ...styles.lvlInput, flex: 2, color: C.text }} />
              <input type="number" value={l.minXp} onChange={(e) => updateLevel(i, "minXp", Number(e.target.value))} style={styles.lvlInputNum} />
              <input type="color" value={l.color} onChange={(e) => updateLevel(i, "color", e.target.value)} style={styles.lvlColor} />
              <input type="number" step="0.01" value={l.miningRate} onChange={(e) => updateLevel(i, "miningRate", Number(e.target.value))} style={styles.lvlInputNum} />
            </div>
          ))}
          <button
            onClick={saveLevels}
            disabled={savingSettings}
            className="btn btn-primary"
            style={{ padding: "14px", fontSize: 14, fontWeight: 800, width: "100%", marginTop: 12 }}
          >
            {savingSettings ? t("admin.savingSettings") : t("admin.levels.save")}
          </button>
        </div>
      ) : (
        <>
        <div style={styles.statsGrid}>
          {statCards.map((s, i) => (
          <div key={i} className="glass" style={styles.statCard}>
            <span style={styles.statIcon}>{s.icon}</span>
            <span style={styles.statLabel}>{s.label}</span>
            <h2 style={{ ...styles.statValue, color: s.color }}>
              {s.value} <span style={{ fontSize: 12, fontWeight: 700 }}>{s.unit}</span>
            </h2>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", direction: "rtl", fontFamily: font },
  tabBar: { display: "flex", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 6, justifyContent: "center" },
  tabBtn: { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "transparent", color: C.muted, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, transition: "all .2s ease" },
  tabActive: { background: "rgba(0,255,204,0.12)", color: C.teal, boxShadow: "0 0 14px rgba(0,255,204,0.12)" },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6 },
  statsGrid: { display: "flex", gap: 15, justifyContent: "space-between", flexWrap: "wrap" },
  statCard: { borderRadius: 18, padding: 22, flex: 1, minWidth: 180, textAlign: "center" },
  statIcon: { fontSize: 22, display: "block", marginBottom: 8 },
  statLabel: { color: C.muted, fontSize: 13, display: "block" },
  statValue: { margin: "10px 0 0 0", fontSize: 22, color: C.text, fontWeight: 900 },
  tableCard: { padding: 24 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 15px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  noData: { color: C.green, textAlign: "center", fontSize: 14, margin: "20px 0", fontWeight: 800 },
  card: { padding: 24, marginBottom: 18 },
  cardSub: { color: C.muted, fontSize: 12, margin: "-6px 0 14px", lineHeight: 1.7 },
  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 },
  textarea: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontFamily: font, outline: "none", resize: "vertical" },
  tgeRow: { display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 },
  inputNum: { width: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 12px", fontSize: 14, fontFamily: font, outline: "none", textAlign: "center" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 },
  thRow: { borderBottom: "1px solid rgba(255,255,255,0.12)" },
  th: { color: C.muted, padding: "12px 8px", fontWeight: 700 },
  tdRow: { borderBottom: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "14px 8px", color: C.text },
  tdActions: { padding: "14px 8px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  actionBtn: { borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", border: "none", fontFamily: font },
  rejectBtn: { background: "rgba(255,77,77,0.15)", border: "1px solid rgba(255,77,77,0.4)", color: "#ff4d4d" },
  // 🏆 محرر المستويات
  lvlHead: { display: "flex", gap: 8, alignItems: "center", padding: "4px 2px 8px", color: C.muted, fontSize: 11, fontWeight: 800 },
  lvlColNum: { width: 28, textAlign: "center" },
  lvlCol: { flex: 1, textAlign: "center" },
  lvlRow: { display: "flex", gap: 8, alignItems: "center", padding: "7px 2px", borderTop: "1px solid rgba(255,255,255,0.06)" },
  lvlNum: { width: 28, textAlign: "center", fontWeight: 900, fontSize: 14 },
  lvlInput: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: font, outline: "none" },
  lvlInputNum: { width: 64, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "8px 6px", fontSize: 12.5, fontFamily: font, outline: "none", color: C.text, textAlign: "center" },
  lvlColor: { width: 38, height: 34, border: "none", background: "transparent", cursor: "pointer", padding: 0 },
};
