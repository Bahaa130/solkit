import { apiFetch } from "../lib/api";
// src/pages/AirdropPage.tsx
// 🪂 الإسقاط الجوي — ورقة بيضاء مصغّرة + الطرح القريب + البورصات اللامركزية + ملف المشاركة
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, styles as T } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useBranding } from "../branding";
import CoinIcon from "../components/CoinIcon";
import { useToast } from "../components/Toast";

interface AirdropPageProps {
  userId: number;
  token: string;
}

// 🪙 بيانات العملة الحقيقية من إعدادات المشروع
const TOKEN_MINT = "gWgPKqXQRGh7rNRXi4EBSg6vacCBTYWcZ11SEHpumTT";
const TOKEN_DECIMALS = 9;
const TOKEN_SUPPLY = 1_000_000;

// ⏳ هدف الطرح الحي: يُجلب من الخادم (يتحكم به المدير من لوحة الإعدادات)
// إن لم يُعيّن عدّاد من الخادم → يُستخدم افتراضي 30 يوماً للأمام لراحة العرض
const TGE_FALLBACK_MS = 30 * 24 * 3600 * 1000; // 30 يوماً افتراضياً
const getTgeFallback = (): number => Date.now() + TGE_FALLBACK_MS;

// 🦍 البورصات اللامركزية التي سيتم الاكتتاب عليها
const DEXS = [
  { name: "Raydium", icon: "🌀", color: "#4CE0A3" },
  { name: "Jupiter", icon: "🪐", color: "#8A6BFF" },
  { name: "Orca", icon: "🐋", color: "#FF7A00" },
  { name: "Meteora", icon: "☄️", color: "#2DD4BF" },
  { name: "Pump.fun", icon: "🚀", color: "#FF5C7A" },
];

// 🗺️ خارطة الطريق الافتراضية (تُستبدل بالقيمة الحية من إعدادات المدير)
const DEFAULT_ROADMAP = [
  { icon: "⚙️", label: "بناء النظام الأساسي", status: "done" as const },
  { icon: "🔐", label: "تفعيل أمني + اختبار", status: "done" as const },
  { icon: "🚀", label: "إطلاق النسخة التجريبية", status: "current" as const },
  { icon: "🦍", label: "إطلاق النسخة الكاملة", status: "upcoming" as const },
  { icon: "🌐", label: "التوسع والبورصات", status: "upcoming" as const },
];

// 📋 خطوات المشاركة
const STEPS = [
  { key: "airdrop.pStep1", icon: "🦊" },
  { key: "airdrop.pStep2", icon: "⛏️" },
  { key: "airdrop.pStep3", icon: "🔗" },
  { key: "airdrop.pStep4", icon: "📢" },
];

interface Profile {
  balance: number;
  level: number;
  referrals: number;
  gamesEarned: number;
  bonusStreak: number;
}

interface DistSummary {
  totalDistributed: number;
  totalRecipients: number;
  batchCount: number;
  userTotal: number;
  userRecords: { id: number; batchId: number; amount: number; status: string; createdAt: string }[];
}

export default function AirdropPage({ userId, token }: AirdropPageProps) {
  const { dir, t, lang } = useLang();
  const { branding } = useBranding();
  const toast = useToast();
  const [target, setTarget] = useState<number>(getTgeFallback);
  const [now, setNow] = useState(Date.now());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dist, setDist] = useState<DistSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🪙 بيانات العملة الديناميكية من إعدادات المدير (تتحدث فور تعديل عقد العملة في اللوحة)
  const [tokenMint, setTokenMint] = useState(TOKEN_MINT);
  const [tokenDecimals, setTokenDecimals] = useState(TOKEN_DECIMALS);
  const [tokenSupply, setTokenSupply] = useState(TOKEN_SUPPLY);
  // 🗺️ خارطة الطريق الديناميكية من إعدادات المدير
  const [roadmap, setRoadmap] = useState(DEFAULT_ROADMAP);
  // 💼 اقتصاديات التوكن الديناميكية من إعدادات المدير (نسب التوزيع + الألوان + التسميات)
  const [tokenomics, setTokenomics] = useState<{ label: string; pct: number; color: string }[]>([]);
  const [tokenomicsLoaded, setTokenomicsLoaded] = useState(false);

  // ⏳ عدّاد حي
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // تنظيف مؤقت النسخ
  useEffect(() => {
    return () => { if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);

  // 👤 تحميل ملف المشاركة الشخصي
  const loadProfile = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const p: Profile = { balance: 0, level: 1, referrals: 0, gamesEarned: 0, bonusStreak: 1 };
      const userRes = await apiFetch(`/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (userRes.ok) {
        const raw = await userRes.text();
        if (raw) {
          const u = JSON.parse(raw);
          p.balance = Number(u.balance || 0);
          p.level = Number(u.currentLevel || 1);
          const bonuses = u.dailyBonuses || [];
          if (bonuses.length > 0) {
            const latest = bonuses.sort((a: any, b: any) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())[0];
            p.bonusStreak = latest?.streakDay || 1;
          }
        }
      }
      const refRes = await apiFetch("/api/users/referral-network", { headers: { Authorization: `Bearer ${token}` } });
      if (refRes.ok) {
        const raw = await refRes.text();
        if (raw) p.referrals = Number(JSON.parse(raw).totalReferrals || 0);
      }
      try {
        const g = await apiFetch("/api/users/games/status", { headers: { Authorization: `Bearer ${token}` } });
        if (g.ok) {
          const raw = await g.text();
          if (raw) p.gamesEarned = Number(JSON.parse(raw).totalEarned || 0);
        }
      } catch { /* اختياري */ }
      try {
        const d = await apiFetch("/api/users/distribution/summary", { headers: { Authorization: `Bearer ${token}` } });
        if (d.ok) {
          const raw = await d.text();
          if (raw) setDist(JSON.parse(raw));
        }
      } catch { /* اختياري */ }

      // ⏳ جلب هدف عدّاد TGE من إعدادات الخادم (يتحكم به المدير)
      try {
        const s = await apiFetch("/api/users/settings", { headers: { Authorization: `Bearer ${token}` } });
        if (s.ok) {
          const raw = await s.text();
          if (raw) {
            const data = JSON.parse(raw);
            if (data.tgeTarget && Number(data.tgeTarget) > Date.now()) {
              setTarget(Number(data.tgeTarget));
            }
            // 🪙 تحديث بيانات العقد الحية من إعدادات المدير
            if (data.tokenMint && typeof data.tokenMint === "string" && data.tokenMint.length >= 32) {
              setTokenMint(data.tokenMint);
            }
            if (Number(data.tokenDecimals) >= 0) {
              setTokenDecimals(Number(data.tokenDecimals));
            }
            if (Number(data.tokenSupply) >= 0) {
              setTokenSupply(Number(data.tokenSupply));
            }
            if (Array.isArray(data.roadmap) && data.roadmap.length > 0) {
              setRoadmap(data.roadmap);
            }
            // 💼 تحميل اقتصاديات التوكن الحية (نسب التوزيع + الألوان + التسميات)
            if (Array.isArray(data.tokenomics) && data.tokenomics.length > 0) {
              setTokenomics(data.tokenomics.map((s: any) => ({
                label: String(s.label || ""),
                pct: Math.max(0, Math.min(100, Number(s.pct) || 0)),
                color: String(s.color || "#00ffcc"),
              })));
            } else {
              setTokenomics([
                { label: t("airdrop.allocMining"), pct: 40, color: "#00ffcc" },
                { label: t("airdrop.allocGames"), pct: 25, color: "#7c5cff" },
                { label: t("airdrop.allocCommunity"), pct: 20, color: "#ffb020" },
                { label: t("airdrop.allocTeam"), pct: 15, color: "#ff5c7a" },
              ]);
            }
            setTokenomicsLoaded(true);
          }
        }
      } catch { /* اختياري */ }

      setProfile(p);
      setErr(null);
    } catch (e) {
      console.error("Airdrop profile load error:", e);
      setErr(t("airdrop.connError"));
    }
  }, [userId, token, t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleCopyMint = () => {
    navigator.clipboard.writeText(tokenMint);
    setCopied(true);
    toast.success(t("airdrop.copied"));
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2200);
  };

  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const numDir = "ltr";

  const statCards = profile ? [
    { label: t("airdrop.profileBalance"), value: profile.balance.toFixed(2), color: C.teal },
    { label: t("airdrop.profileLevel"), value: `${profile.level}`, color: C.green },
    { label: t("airdrop.profileReferrals"), value: `${profile.referrals}`, color: C.purple },
    { label: t("airdrop.profileGames"), value: profile.gamesEarned.toFixed(1), color: C.amber },
    { label: t("airdrop.profileBonus"), value: `${profile.bonusStreak}`, color: C.red },
  ] : [];

  return (
    <div style={{ ...T.page, direction: dir, maxWidth: 640 }}>
      {/* 🪂 البانر + العدّاد */}
      <div style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <span className="pill" style={styles.badge}>{t("airdrop.badge")}</span>
          <h2 style={styles.heroTitle}>{t("airdrop.heroTitle")}</h2>
          <p style={styles.heroSub}>{t("airdrop.heroSub")}</p>
          <div style={{ ...styles.tgeRow, textAlign: "center" }}>
            <span style={styles.tgeLabel}>{t("airdrop.tge")}</span>
            <span style={styles.tgeSoon}>{t("airdrop.tgeSoon")}</span>
          </div>
        </div>

        {/* ⏳ العدّاد التنازلي */}
        <div style={{ ...styles.countdown, direction: numDir }}>
          {[
            { v: days, label: t("airdrop.days") },
            { v: hours, label: t("airdrop.hours") },
            { v: minutes, label: t("airdrop.minutes") },
            { v: seconds, label: t("airdrop.seconds") },
          ].map((b, i) => (
            <div key={i} className="glass" style={styles.cdBox}>
              <span style={styles.cdValue}>{String(b.v).padStart(2, "0")}</span>
              <span style={styles.cdLabel}>{b.label}</span>
            </div>
          ))}
        </div>
        <p style={styles.cdNote}>{t("airdrop.countdownLabel")}</p>
      </div>

      {/* 📜 الورقة البيضاء — معلومات العملة */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.whitepaper")}</h3>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>{t("airdrop.tokenSymbol")}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CoinIcon size={22} />
              <span className="gradient-text" style={{ ...styles.infoValue, fontSize: 20, fontWeight: 900 }}>{branding.tokenSymbol}</span>
            </span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>{t("airdrop.tokenChain")}</span>
            <span style={styles.infoValue}><span style={{ color: C.teal }}>◎</span> Solana</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>{t("airdrop.tokenDecimals")}</span>
            <span style={styles.infoValue}>{tokenDecimals}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>{t("airdrop.tokenSupply")}</span>
            <span style={styles.infoValue}>{tokenSupply.toLocaleString(lang === "ar" ? "ar-EG" : lang)}</span>
          </div>
        </div>
        <div style={styles.mintRow}>
          <span style={styles.infoLabel}>{t("airdrop.tokenMint")}</span>
          <div style={styles.copyBox}>
            <code style={{ ...styles.mint, direction: "ltr" }} title={tokenMint}>
              {tokenMint.slice(0, 14)}...{tokenMint.slice(-6)}
            </code>
            <button onClick={handleCopyMint} className={copied ? "btn btn-ghost" : "btn btn-primary"} style={{ padding: "7px 14px", fontSize: 12, whiteSpace: "nowrap" }}>
              {copied ? "✓" : t("airdrop.copy")}
            </button>
          </div>
        </div>
      </div>

      {/* 🧬 اقتصاديات التوكن — نسب يتحكم بها المدير من لوحة الإدارة */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.tokenomicsTitle")}</h3>
        <p style={styles.cardSub}>{t("airdrop.tokenomicsSub")}</p>
        {!tokenomicsLoaded ? (
          <p style={{ color: C.muted, textAlign: "center", padding: 18, fontSize: 13 }}>{t("common.loading")}</p>
        ) : tokenomics.length === 0 ? (
          <p style={{ color: C.muted, textAlign: "center", padding: 18, fontSize: 13 }}>{t("airdrop.distNone")}</p>
        ) : (
          <>
            <div style={styles.tokenBar}>
              {tokenomics.map((seg, i) => (
                <div key={i} style={{ width: `${seg.pct}%`, background: seg.color, height: "100%" }} title={seg.label} />
              ))}
            </div>
            <div style={styles.legend}>
              {tokenomics.map((seg, i) => (
                <div key={i} style={styles.legendItem}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                  <span style={styles.legendText}>{seg.label}</span>
                  <span style={{ ...styles.legendPct, color: seg.color }}>{seg.pct}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 📊 توزيعات التوكن — ما تم توزيعه حتى الآن */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.distTitle")}</h3>
        <p style={styles.cardSub}>{t("airdrop.distSub")}</p>
        {!dist ? (
          <p style={{ color: C.muted, textAlign: "center", padding: 18, fontSize: 13 }}>{t("common.loading")}</p>
        ) : dist.batchCount > 0 ? (
          <>
            <div style={styles.statGrid}>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>{t("airdrop.distTotal")}</span>
                <span style={{ ...styles.statValue, color: C.teal }}>{dist.totalDistributed.toFixed(2)}</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>{t("airdrop.distBatches")}</span>
                <span style={{ ...styles.statValue, color: C.purple }}>{dist.batchCount}</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>{t("airdrop.distRecipients")}</span>
                <span style={{ ...styles.statValue, color: C.green }}>{dist.totalRecipients}</span>
              </div>
              <div style={styles.statBox}>
                <span style={styles.statLabel}>{t("airdrop.distYourShare")}</span>
                <span style={{ ...styles.statValue, color: C.amber }}>{dist.userTotal.toFixed(2)}</span>
              </div>
            </div>

            {dist.userRecords.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {dist.userRecords.map((r) => (
                  <div key={r.id} style={styles.distRow}>
                    <span style={styles.distRoundBadge}>{t("airdrop.distRound")} #{r.batchId}</span>
                    <span style={styles.distAmt}>+{r.amount.toFixed(3)}</span>
                    <span style={styles.distDate}>{new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ color: C.muted, textAlign: "center", padding: 18, fontSize: 12.5, lineHeight: 1.9 }}>
            🕒 {t("airdrop.distNone")}
            <br />
            <span style={{ color: C.faint, fontSize: 11.5 }}>{t("airdrop.distEmpty")}</span>
          </p>
        )}
      </div>

      {/* 🦍 الاكتتاب على المنصات اللامركزية */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.listingTitle")}</h3>
        <p style={styles.cardSub}>{t("airdrop.listingSub")}</p>
        <div style={styles.dexRow}>
          {DEXS.map((d) => (
            <div key={d.name} className="game-card" style={{ ...styles.dexChip, borderColor: `${d.color}44`, background: `${d.color}12` }}>
              <span style={{ fontSize: 22 }}>{d.icon}</span>
              <span style={{ ...styles.dexName, color: d.color }}>{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 🗺️ خارطة الطريق */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.roadmapTitle")}</h3>
        <div style={styles.roadmap}>
          {roadmap.map((r, i) => {
            const done = r.status === "done";
            const current = r.status === "current";
            return (
              <div key={i} style={styles.rmStep}>
                <div style={{ ...styles.rmDot, background: current ? C.purple : done ? C.green : "rgba(255,255,255,0.12)", boxShadow: current ? "0 0 14px rgba(124,92,255,0.7)" : "none" }}>
                  {r.icon}
                </div>
                {i < roadmap.length - 1 && <div style={{ ...styles.rmLine, background: done ? C.green : "rgba(255,255,255,0.08)" }} />}
                <p style={{ ...styles.rmText, color: done || current ? C.text : C.muted, fontWeight: current ? 800 : 600 }}>{r.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 👤 ملف المشاركة الشخصي */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.profileTitle")}</h3>
        <p style={styles.cardSub}>{t("airdrop.profileSub")}</p>
        {err && <p style={{ color: C.red, fontSize: 12, textAlign: "center", margin: "10px 0" }}>{err}</p>}
        {!profile && !err ? (
          <p style={{ color: C.muted, textAlign: "center", padding: 18, fontSize: 13 }}>{t("common.loading")}</p>
        ) : (
          <>
            <div style={styles.statGrid}>
              {statCards.map((s) => (
                <div key={s.label} style={styles.statBox}>
                  <span style={styles.statLabel}>{s.label}</span>
                  <span style={{ ...styles.statValue, color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <span className="pill" style={profile && profile.balance > 0 ? styles.eligible : styles.notEligible}>
                {profile && profile.balance > 0 ? t("airdrop.eligible") : t("airdrop.notEligible")}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 📋 خطوات المشاركة */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("airdrop.participate")}</h3>
        <div style={styles.stepList}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={styles.stepRow}>
              <span style={styles.stepNum}>{i + 1}</span>
              <span style={styles.stepIcon}>{s.icon}</span>
              <span style={styles.stepText}>{t(s.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  hero: {
    position: "relative", overflow: "hidden", borderRadius: 22, padding: "26px 18px 20px",
    background: "linear-gradient(135deg, rgba(124,92,255,0.18), rgba(0,255,204,0.14))",
    border: "1px solid rgba(124,92,255,0.3)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 18,
  },
  heroGlow: { position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,92,255,0.35), transparent 70%)", pointerEvents: "none" },
  badge: { background: "rgba(124,92,255,0.18)", color: "#c3b3ff", border: "1px solid rgba(124,92,255,0.4)", padding: "6px 14px", fontSize: 11, marginBottom: 8 },
  heroTitle: { margin: 0, fontSize: 21, fontWeight: 900, color: C.text, textAlign: "center" },
  heroSub: { margin: "6px 0 8px", color: C.muted, fontSize: 12.5, lineHeight: 1.8, textAlign: "center", maxWidth: 420 },
  tgeRow: { display: "flex", justifyContent: "center", alignItems: "center", gap: 8, flexWrap: "wrap" },
  tgeLabel: { color: C.muted, fontSize: 12, fontWeight: 700 },
  tgeSoon: { color: C.amber, fontSize: 12, fontWeight: 900 },
  countdown: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center" },
  cdBox: { borderRadius: 14, padding: "10px 4px", minWidth: 62, textAlign: "center", background: "rgba(7,11,22,0.55)", border: "1px solid rgba(255,255,255,0.1)" },
  cdValue: { display: "block", fontSize: 22, fontWeight: 900, color: C.teal, fontVariantNumeric: "tabular-nums" },
  cdLabel: { display: "block", fontSize: 9.5, color: C.muted, marginTop: 2, fontWeight: 700 },
  cdNote: { color: C.faint, fontSize: 10.5, margin: "8px 0 0", fontWeight: 700 },
  card: { padding: 22, marginBottom: 18 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  cardSub: { color: C.muted, fontSize: 12, margin: "-6px 0 14px", lineHeight: 1.7 },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 },
  infoItem: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", textAlign: "center" },
  infoLabel: { display: "block", color: C.muted, fontSize: 10.5, marginBottom: 5, fontWeight: 700 },
  infoValue: { fontSize: 15, fontWeight: 800, color: C.text },
  mintRow: { marginTop: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px" },
  copyBox: { display: "flex", gap: 10, alignItems: "center" },
  mint: { flex: 1, fontSize: 12, color: C.teal, fontFamily: "monospace", background: "rgba(7,11,22,0.6)", border: "1px solid rgba(0,255,204,0.15)", borderRadius: 10, padding: "9px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tokenBar: { display: "flex", width: "100%", height: 14, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.06)", marginBottom: 14 },
  legend: { display: "flex", flexDirection: "column", gap: 8 },
  legendItem: { display: "flex", alignItems: "center", gap: 8 },
  legendText: { flex: 1, color: C.text, fontSize: 12, fontWeight: 700 },
  legendPct: { fontSize: 12, fontWeight: 900 },
  dexRow: { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" },
  dexChip: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, borderRadius: 16, padding: "14px 16px", minWidth: 84, border: "1px solid", transition: "transform .2s ease" },
  dexName: { fontSize: 11.5, fontWeight: 800 },
  roadmap: { display: "flex", flexDirection: "column" },
  rmStep: { display: "flex", alignItems: "flex-start", gap: 12, position: "relative" },
  rmDot: { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, border: "1px solid rgba(255,255,255,0.15)", marginTop: 2 },
  rmLine: { position: "absolute", left: 16, top: 40, bottom: -14, width: 2, borderRadius: 2 },
  rmText: { margin: "8px 0 18px", fontSize: 12.5, lineHeight: 1.7, color: C.muted },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 10 },
  statBox: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 10px", textAlign: "center" },
  statLabel: { display: "block", color: C.muted, fontSize: 10, marginBottom: 5, fontWeight: 700 },
  statValue: { fontSize: 16, fontWeight: 900 },
  eligible: { background: "rgba(34,229,132,0.12)", color: C.green, border: "1px solid rgba(34,229,132,0.3)", padding: "8px 18px", fontSize: 12 },
  notEligible: { background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.3)", padding: "8px 18px", fontSize: 12 },
  distRow: { display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 14px" },
  distRoundBadge: { background: "rgba(124,92,255,0.12)", color: "#c3b3ff", border: "1px solid rgba(124,92,255,0.3)", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  distAmt: { flex: 1, textAlign: "center", color: C.teal, fontSize: 14, fontWeight: 900 },
  distDate: { color: C.muted, fontSize: 11, whiteSpace: "nowrap" },
  stepList: { display: "flex", flexDirection: "column", gap: 10 },
  stepRow: { display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px" },
  stepNum: { width: 26, height: 26, borderRadius: "50%", background: "rgba(0,255,204,0.12)", color: C.teal, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, flexShrink: 0 },
  stepIcon: { fontSize: 18 },
  stepText: { color: C.text, fontSize: 12.5, fontWeight: 700, flex: 1 },
};
