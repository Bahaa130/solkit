import { apiFetch } from "../lib/api";
// src/pages/BonusPage.tsx
// 📅 البونص اليومي — مستوى التقدم + قفل 24 ساعة بعدّاد حي + سلسلة 7 أيام
import React, { useCallback, useEffect, useState } from "react";
import { C, G, styles as T } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useToast } from "../components/Toast";

interface BonusPageProps { userId: number; token: string; }

const STREAK_REWARDS = [1, 2, 3, 4, 5, 6, 10];
const XP_PER_LEVEL = 100;
const LOCK_MS = 24 * 3600 * 1000; // قفل 24 ساعة
// 🧮 مضاعف البونص حسب مستوى الحساب (مطابق للخلفية)
const LEVEL_MULT: Record<number, number> = { 1: 1.0, 2: 1.05, 3: 1.1 };

export default function BonusPage({ userId, token }: BonusPageProps) {
  const { dir, t } = useLang();
  const toast = useToast();
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(1); // آخر يوم مطالب به في السلسلة
  const [lastClaimAt, setLastClaimAt] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(Date.now());

  // ⏱️ عدّاد حي لعدّاد القفل
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const fetchBonus = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setLevel(Number(data.currentLevel || 1));
        setXp(Number(data.currentXp || 0));
        const bonuses = data.dailyBonuses || [];
        if (bonuses.length > 0) {
          const latest = bonuses.sort((a: any, b: any) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())[0];
          setStreak(Number(latest.streakDay || 1));
          setLastClaimAt(new Date(latest.claimedAt).getTime());
        } else {
          setStreak(1);
          setLastClaimAt(null);
        }
      }
    } catch (err) { console.error(err); }
  }, [userId]);

  useEffect(() => { fetchBonus(); }, [fetchBonus]);

  // ── حساب حالة السلسلة والقفل ──
  const hoursSince = lastClaimAt !== null ? (now - lastClaimAt) / 3600000 : Infinity;
  const locked = lastClaimAt !== null && hoursSince < 24;
  const nextClaimAt = lastClaimAt !== null ? lastClaimAt + LOCK_MS : null;

  let nextStreak = 1; // اليوم القادم للمطالبة
  let claimedUpTo = 0; // عدد الأيام المطالب بها في الدورة الحالية
  if (lastClaimAt !== null) {
    if (hoursSince >= 48) { nextStreak = 1; claimedUpTo = 0; }
    else if (hoursSince >= 24) { nextStreak = streak >= 7 ? 1 : streak + 1; claimedUpTo = streak; }
    else { nextStreak = streak; claimedUpTo = streak; } // لا يزال مقفلاً اليوم
  }

  const mult = LEVEL_MULT[level] || 1;
  const nextLevel = level < 3 ? level + 1 : 3;
  const nextMult = LEVEL_MULT[nextLevel] || mult;
  const xpPct = Math.min(100, Math.round((xp / XP_PER_LEVEL) * 100));

  const remainSec = locked && nextClaimAt ? Math.max(0, Math.ceil((nextClaimAt - now) / 1000)) : 0;
  const hh = String(Math.floor(remainSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remainSec % 3600) / 60)).padStart(2, "0");
  const ss = String(remainSec % 60).padStart(2, "0");

  const handleClaim = async () => {
    if (!token || locked || claiming) return;
    try {
      setClaiming(true);
      const res = await apiFetch("/api/users/claim-daily", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (res.ok) {
        toast.success(data.message || t("bonus.claimAvailable"));
        setStreak(nextStreak); // السيرفر أنشأ سجلاً بيوم nextStreak
        setLastClaimAt(Date.now());
        fetchBonus();
      } else {
        toast.warning(data.message || t("bonus.alreadyClaimed"));
      }
    } catch { toast.error(t("bonus.connError")); }
    finally { setClaiming(false); }
  };

  return (
    <div style={{ ...T.page, direction: dir, maxWidth: 560, textAlign: "center" }}>
      {/* 🏆 مستوى الحساب وتقدم الخبرة */}
      <div className="glass" style={styles.xpCard}>
        <div style={styles.levelRow}>
          <span style={styles.levelLabel}>{t("bonus.levelTitle")}</span>
          <span style={styles.levelBadge}>{t("bonus.levelValue", { n: level })}</span>
        </div>
        <div style={styles.xpBar}>
          <div style={{ width: `${xpPct}%`, height: "100%", background: G.primary, borderRadius: 8, transition: "width .5s ease" }} />
        </div>
        <div style={styles.xpMeta}>
          <span style={styles.xpText}>{t("bonus.xpText", { xp })}</span>
          <span style={{ ...styles.xpText, color: C.teal, fontWeight: 900 }}>{t("bonus.xpPercent", { p: xpPct })}</span>
        </div>

        {/* مضاعف البونص حسب المستوى */}
        <div style={styles.multBox}>
          <span style={styles.multLabel}>{t("bonus.multBonus")}</span>
          <span className="gradient-text" style={styles.multValue}>×{mult.toFixed(2)}</span>
          {level < 3 && (
            <span style={styles.multHint}>{t("bonus.multNext", { n: nextLevel, m: nextMult.toFixed(2) })}</span>
          )}
        </div>
      </div>

      {/* 📆 سلسلة الـ 7 أيام */}
      <div className="glass" style={styles.xpCard}>
        <h3 style={styles.gridTitle}>{t("bonus.streakGrid")}</h3>
        <div style={styles.grid}>
          {STREAK_REWARDS.map((r, i) => {
            const day = i + 1;
            const isClaimed = day <= claimedUpTo;
            const isNext = day === nextStreak;
            return (
              <div
                key={day}
                style={{
                  ...styles.dayCard,
                  borderColor: isNext ? (locked ? "rgba(255,176,32,0.5)" : "rgba(255,176,32,0.8)") : isClaimed ? "rgba(34,229,132,0.3)" : "rgba(255,255,255,0.07)",
                  background: isNext ? "rgba(255,176,32,0.08)" : isClaimed ? "rgba(34,229,132,0.06)" : "rgba(255,255,255,0.02)",
                  boxShadow: isNext && !locked ? "0 0 18px rgba(255,176,32,0.25)" : "none",
                }}
              >
                <span className={isNext && !locked ? "pulse-glow" : ""} style={styles.dayNum}>
                  {t("bonus.day", { n: day })}
                </span>
                <span style={{ ...styles.dayReward, color: isNext ? C.amber : isClaimed ? C.green : C.muted }}>
                  {t("bonus.dayReward", { r })}
                </span>
                <span style={{ ...styles.dayState, color: isNext ? C.amber : isClaimed ? C.green : C.faint, fontSize: 9.5 }}>
                  {isNext ? (locked ? "🔒" : t("bonus.todayNext")) : isClaimed ? t("bonus.claimed") : t("bonus.lockedFuture")}
                </span>
              </div>
            );
          })}
        </div>
        <p style={styles.streakDesc}>{t("bonus.streakDesc")}</p>
      </div>

      {/* 🎁 زر المطالبة + قفل 24 ساعة */}
      <div className="glass" style={{ ...styles.xpCard, padding: 26 }}>
        {locked ? (
          <>
            <div className="floaty" style={{ fontSize: 34 }}>⏳</div>
            <h4 style={styles.lockTitle}>{t("bonus.claimLocked")}</h4>
            <div style={styles.countdownBox} dir="ltr">
              <span style={styles.cdDigit}>{hh}</span>
              <span style={styles.cdColon}>:</span>
              <span style={styles.cdDigit}>{mm}</span>
              <span style={styles.cdColon}>:</span>
              <span style={styles.cdDigit}>{ss}</span>
            </div>
            <button disabled className="btn btn-ghost" style={{ padding: "14px 30px", fontSize: 14, marginTop: 16 }}>
              🔒 {t("bonus.claimBtn")}
            </button>
          </>
        ) : (
          <>
            <div className="floaty" style={{ fontSize: 34 }}>🎁</div>
            <h4 style={styles.lockTitle}>{t("bonus.claimAvailable")}</h4>
            <button onClick={handleClaim} disabled={claiming} className="btn btn-amber pulse-glow" style={{ padding: "16px 36px", fontSize: 15, marginTop: 8 }}>
              {claiming ? <><span className="spinner" style={{ borderTopColor: "#fff" }} /> {t("common.loading")}</> : t("bonus.claimBtn")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  xpCard: { padding: 22, marginBottom: 20, textAlign: "center" },
  levelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  levelLabel: { color: C.muted, fontSize: 13, fontWeight: 700 },
  levelBadge: { background: "rgba(0,255,204,0.12)", color: C.teal, border: "1px solid rgba(0,255,204,0.3)", borderRadius: 999, padding: "6px 16px", fontSize: 14, fontWeight: 900 },
  xpBar: { width: "100%", height: 12, background: "rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden", marginTop: 6 },
  xpMeta: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  xpText: { fontSize: 12, color: C.muted },
  multBox: { marginTop: 16, background: "rgba(124,92,255,0.08)", border: "1px solid rgba(124,92,255,0.2)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" },
  multLabel: { color: C.muted, fontSize: 12, fontWeight: 700 },
  multValue: { fontSize: 18, fontWeight: 900 },
  multHint: { color: C.muted, fontSize: 11, width: "100%", textAlign: "center" },
  gridTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 14px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 },
  dayCard: { border: "1px solid", borderRadius: 14, padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "all .25s ease" },
  dayNum: { fontSize: 11, fontWeight: 900, color: C.text, borderRadius: 999, padding: "2px 8px", background: "rgba(255,255,255,0.06)" },
  dayReward: { fontSize: 11.5, fontWeight: 900 },
  dayState: { fontWeight: 700 },
  streakDesc: { color: C.faint, fontSize: 11, marginTop: 12, lineHeight: 1.7 },
  lockTitle: { color: C.text, fontSize: 16, fontWeight: 900, margin: "8px 0 4px" },
  countdownBox: { display: "flex", justifyContent: "center", alignItems: "center", gap: 6, margin: "12px 0 4px" },
  cdDigit: { background: "rgba(7,11,22,0.7)", border: "1px solid rgba(255,176,32,0.3)", borderRadius: 12, padding: "10px 12px", fontSize: 24, fontWeight: 900, color: C.amber, fontVariantNumeric: "tabular-nums", minWidth: 52, textAlign: "center" },
  cdColon: { color: C.muted, fontSize: 22, fontWeight: 900 },
};
