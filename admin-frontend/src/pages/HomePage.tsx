import { apiFetch } from "../lib/api";
// src/pages/HomePage.tsx
// 🏠 الرئيسية — دمج التعدين والألعاب في صفحة واحدة حيوية وجذابة
import React, { useCallback, useEffect, useState } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";
import CoinIcon from "../components/CoinIcon";
import { useBranding } from "../branding";
import { useToast } from "../components/Toast";
import { fetchGamesStatus } from "../components/games/gamesApi";
import type { GamesStatus } from "../components/games/gamesApi";
import { formatCooldown } from "../components/games/gamesUtils";
import CountUp from "../components/games/CountUp";
import LuckyWheel from "../components/games/LuckyWheel";
import CoinCatcher from "../components/games/CoinCatcher";
import XO from "../components/games/XO";

interface HomePageProps {
  userId: number;
  token: string;
  onNavigateTab?: (t: string) => void;
}

type GameKey = "wheel" | "xo" | "catch";

const GAMES: { key: GameKey; icon: string; titleKey: string; tagKey: string; btn: string; color: string; glow: string }[] = [
  { key: "wheel", icon: "🎰", titleKey: "game.wheelTitle", tagKey: "game.wheelTag", btn: "btn-purple", color: C.purple, glow: "rgba(124,92,255,0.35)" },
  { key: "catch", icon: "🪙", titleKey: "game.catchTitle", tagKey: "game.catchTag", btn: "btn-amber", color: C.amber, glow: "rgba(255,176,32,0.35)" },
  { key: "xo", icon: "❌", titleKey: "game.xoTitle", tagKey: "game.xoTag", btn: "btn-amber", color: C.amber, glow: "rgba(255,176,32,0.35)" },
];

export default function HomePage({ userId, token, onNavigateTab }: HomePageProps) {
  const { dir, t } = useLang();
  const { branding } = useBranding();
  const [balance, setBalance] = useState(0);
  const [level, setLevel] = useState(1);
  const [levelPlan, setLevelPlan] = useState<{ level: number; name: string; minXp: number; color: string; miningRate: number }[]>([]);
  const [miningStatus, setMiningStatus] = useState({ status: "stopped", miningRate: 0.5, timeLeft: 0, pendingMinedAmount: 0 });
  const [gamesStatus, setGamesStatus] = useState<GamesStatus | null>(null);
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [sessionTotal, setSessionTotal] = useState(0);
  const toast = useToast();

  // 🔑 الرصيد الأساسي من الخادم (دون المكتسب اللحظي غير المُقيد بعد) — مرجع لحساب الرصيد الحي أثناء التعدين
  const baseBalanceRef = React.useRef(0);

  // ⚡ تحديث شامل: رصيد الحساب + حالة التعدين + حالة الألعاب
  const refresh = useCallback(async () => {
    if (!token || !userId) return;
    try {
      let currentBaseBalance = 0;
      const userRes = await apiFetch(`/api/users/${userId}`, { headers: { "Authorization": `Bearer ${token}` } });
      if (userRes.ok) {
        const u = await userRes.json();
        currentBaseBalance = Number(u.balance || 0);
        setLevel(Number(u.currentLevel || 1));
      }
      const miningRes = await apiFetch("/api/users/mining-status", { headers: { "Authorization": `Bearer ${token}` } });
      if (miningRes.ok) {
        const m = await miningRes.json();
        setMiningStatus(m);
        // الرصيد الأساسي من الخادم (دون المكتسب اللحظي غير المُقيد بعد) + المكتسب اللحظي الحالي
        const liveBalance = currentBaseBalance + Number(m.pendingMinedAmount || 0);
        baseBalanceRef.current = currentBaseBalance;
        setBalance(liveBalance);
      }
      try {
        setGamesStatus(await fetchGamesStatus(token));
      } catch {
        /* حالة الألعاب اختيارية — لا تكسر الرئيسية */
      }
    } catch (e) {
      console.error("Home refresh error:", e);
    }
  }, [userId, token]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 60000); // مزامنة خلفية كل دقيقة
    return () => clearInterval(iv);
  }, [refresh]);

  // 🏆 خطة المستويات (لتلوين حلقة التعدين وعرض صندوق المستوى)
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/users/levels");
        if (res.ok) { const d = await res.json(); setLevelPlan(d.plan || []); }
      } catch { /* تجاهل */ }
    })();
  }, []);

  const levelColor = levelPlan.find((l) => l.level === level)?.color || C.teal;

  // ⏱️ عدّاد التعدين الحي: تنازلي للوقت كل ثانية + رصيد حي مشتق من المكتسب اللحظي من الخادم
  // (لا نتراكم يدوياً ثم نعيد الضبط مع refresh — لتفادي الازدواجية وضياع الدقة)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (miningStatus.status === "active" && miningStatus.timeLeft > 0) {
      timer = setInterval(() => {
        setMiningStatus((prev) => {
          if (prev.timeLeft <= 1) {
            clearInterval(timer);
            refresh();
            return { ...prev, status: "stopped", timeLeft: 0, pendingMinedAmount: 0 };
          }
          // تصاعد المكتسب اللحظي محلياً (rate/3600 لكل ثانية) — يُزامَن مع الخادم كل دقيقة عبر refresh
          const rate = Number(prev.miningRate) || 0.5;
          const nextPending = prev.pendingMinedAmount + rate / 3600;
          setBalance((_prevBalance) => {
            // أعد حساب الرصيد الحي = الرصيد الأساسي (دون pending) + المكتسب اللحظي
            return baseBalanceRef.current + nextPending;
          });
          return { ...prev, timeLeft: prev.timeLeft - 1, pendingMinedAmount: nextPending };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [miningStatus.status, miningStatus.timeLeft, refresh]);

  const handleStartMining = async () => {
    try {
      const res = await apiFetch("/api/users/mining-start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      });
      if (res.ok) refresh();
    } catch {
      toast.error(t("home.miningError"));
    }
  };

  // 🪙 ربح حي في الجلسة الحالية
  const handleReward = useCallback((reward: number) => {
    setSessionTotal((prev) => prev + reward);
  }, []);

  const openGame = (key: GameKey) => {
    setSessionTotal(0);
    setActiveGame(key);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const isActive = miningStatus.status === "active";
  const percentage = isActive ? ((86400 - miningStatus.timeLeft) / 86400) * 100 : 0;
  const gameLevel = gamesStatus?.gameLevel || 1;
  const multiplier = gamesStatus?.multiplier || 1;
  const xpForNext = gamesStatus?.xpForNext || 100;
  const xpPct = xpForNext > 0 ? Math.min(100, ((gamesStatus?.gameXp || 0) / xpForNext) * 100) : 0;

  return (
    <div style={{ ...styles.container, direction: dir }}>
      {/* 🎨 البانر الترحيبي */}
      <div style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <h2 style={styles.heroTitle}>{t("home.heroTitle")}</h2>
          <p style={styles.heroSub}>{t("home.heroSub")}</p>
          <div style={styles.heroPills}>
            <span className="pill" style={styles.badgeLevel}>{t("home.accountLevel", { n: level })}</span>
            <span className="pill" style={styles.badgeGame}>{t("home.gamesLevel", { n: gameLevel })} ×{multiplier.toFixed(2)}</span>
          </div>
        </div>
        <div className="floaty" style={{ fontSize: 54, position: "relative", zIndex: 2 }}><CoinIcon size={54} /></div>
      </div>

      {/* 💰 الرصيد */}
      <div className="glass" style={styles.balanceCard}>
        <span style={styles.balanceLabel}>{t("home.balanceLabel")}</span>
        <h1 className="gradient-text" style={styles.balanceValue}>
          <CountUp value={balance} decimals={8} />
        </h1>
        <span style={{ ...styles.balanceUnit, display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <CoinIcon size={14} />
          {t("home.balanceUnit")}
        </span>
      </div>

      {/* 🏆 صندوق عرض المستوى (قابل للنقر → صفحة المستويات) */}
      <div className="glass" style={styles.levelBox} onClick={() => onNavigateTab && onNavigateTab("levels")}>
        <div style={{ ...styles.lbBadge, background: `${levelColor}22`, borderColor: `${levelColor}55` }}>
          <span style={{ ...styles.lbNum, color: levelColor }}>{level}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...styles.lbName, color: levelColor }}>{levelPlan.find((l) => l.level === level)?.name || t("home.accountLevel", { n: level })}</div>
          <div style={{ ...styles.lbHint, color: C.muted }}>{t("levels.viewLevels")}</div>
        </div>
        <span style={{ fontSize: 20 }}>🏆</span>
      </div>

      {/* ⛏️ التعدين */}
      <div className="glass" style={styles.miningCard}>
        <div style={styles.cardHeader}>
          <h3 style={styles.cardTitle}>{t("home.miningTitle")}</h3>
          <span className="pill" style={isActive ? styles.statusActive : styles.statusIdle}>
            {isActive ? t("home.miningRunning") : t("home.miningStopped")}
          </span>
        </div>
        <div style={styles.miningBody}>
          <div style={styles.circleGlow}>
            <div style={{ ...styles.circularProgressBar, background: `conic-gradient(${levelColor} ${percentage}%, rgba(255,255,255,0.06) 0)` }}>
              <div style={styles.innerCircle}>
                {isActive ? (
                  <>
                    <span style={styles.timerText}>{formatTime(miningStatus.timeLeft)}</span>
                    <span style={{ ...styles.rateText, color: levelColor }}>{t("home.miningRate", { rate: Number(miningStatus.miningRate).toFixed(4) })}</span>
                  </>
                ) : (
                  <span style={styles.stoppedText}>{t("home.miningReady")}</span>
                )}
              </div>
            </div>
          </div>
          <div style={styles.miningInfo}>
            <p style={styles.miningDesc}>{t("home.miningDesc")}</p>
            <button
              onClick={handleStartMining}
              disabled={isActive}
              className={isActive ? "btn btn-ghost" : "btn btn-primary pulse-glow"}
              style={{ padding: "13px 22px", fontSize: 14, width: "100%" }}
            >
              {isActive ? t("home.miningBtnActive") : t("home.miningBtnStart")}
            </button>
          </div>
        </div>
      </div>

      {/* 🎮 ساحة الألعاب */}
      <div style={styles.gamesSection}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>{t("home.gamesTitle")}</h3>
          <span style={styles.sectionNote}>{t("home.hourLock")}</span>
        </div>

        {activeGame ? (
          <div className="glass" style={styles.gameArea}>
            <div style={styles.gameHeader}>
              <button onClick={() => setActiveGame(null)} className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }}>{t("home.back")}</button>
              <div style={styles.sessionBox}>
                <span style={{ color: C.muted, fontSize: 12 }}>{t("home.sessionEarned")}</span>
                <span className="gradient-text" style={styles.sessionValue}><CountUp value={sessionTotal} decimals={2} /> {branding.tokenSymbol}</span>
              </div>
            </div>
            {activeGame === "wheel" && (
              <LuckyWheel userId={userId} token={token} multiplier={multiplier} cooldown={gamesStatus?.cooldowns.wheel || 0} onReward={handleReward} onStatusRefresh={refresh} />
            )}
            {activeGame === "catch" && (
              <CoinCatcher token={token} multiplier={multiplier} cooldown={gamesStatus?.cooldowns.catch || 0} onReward={handleReward} onStatusRefresh={refresh} />
            )}
            {activeGame === "xo" && (
              <XO token={token} multiplier={multiplier} cooldown={gamesStatus?.cooldowns.xo || 0} onReward={handleReward} onStatusRefresh={refresh} />
            )}
          </div>
        ) : (
          <>
            {/* بطاقة المستوى الموحد */}
            <div className="glass" style={styles.levelCard}>
              <div style={styles.ringWrap}>
                <div style={{ ...styles.ring, background: `conic-gradient(${C.purple} ${xpPct}%, rgba(255,255,255,0.06) 0)` }}>
                  <div style={styles.ringInner}>
                    <span style={styles.ringValue}>{t("home.ringLevel", { n: gameLevel })}</span>
                    <span style={styles.ringXp}>{t("home.ringXp", { xp: gamesStatus?.gameXp || 0, total: xpForNext })}</span>
                    <span className="pill" style={styles.multPill}>×{multiplier.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div style={styles.levelInfo}>
                <h4 style={styles.levelTitle}>{t("home.levelCardTitle")}</h4>
                <p style={styles.levelDesc}>{t("home.levelCardDesc")}</p>
                <div style={styles.statRow}>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>{t("home.statToday")}</span>
                    <h4 style={styles.statValue}>
                      {(gamesStatus?.todayEarned.total || 0).toFixed(2)}
                      <span style={{ fontSize: 10, color: C.faint }}> / {gamesStatus?.dailyCaps.total || 150}</span>
                    </h4>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>{t("home.statTotal")}</span>
                    <h4 style={styles.statValue}>{(gamesStatus?.totalEarned || 0).toFixed(2)}</h4>
                  </div>
                  <div style={styles.statCard}>
                    <span style={styles.statLabel}>{t("home.statPlays")}</span>
                    <h4 style={styles.statValue}>{gamesStatus?.playsCount || 0}</h4>
                  </div>
                </div>
              </div>
            </div>

            {/* بطاقات الألعاب */}
            <div style={styles.gameList}>
              {GAMES.map((g) => {
                const earned = gamesStatus?.todayEarned[g.key] || 0;
                const cap = gamesStatus?.dailyCaps[g.key] || 0;
                const cd = gamesStatus?.cooldowns[g.key] || 0;
                const locked = cd > 0;
                const barPct = cap > 0 ? Math.min(100, (earned / cap) * 100) : 0;
                const cdText = formatCooldown(cd, t);
                return (
                  <div
                    key={g.key}
                    className="glass game-card"
                    style={{ ...styles.gameCard, boxShadow: locked ? "none" : `0 0 26px ${g.glow}22, 0 8px 30px rgba(0,0,0,0.25)` }}
                  >
                    <div style={{ ...styles.gameIconWrap, borderColor: `${g.color}44`, background: `${g.color}14` }}>{g.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={styles.gameTitle}>{t(g.titleKey)}</h4>
                      <p style={styles.gameTagline}>{t(g.tagKey)}</p>
                      <div style={styles.progressTrack}>
                        <div style={{ ...styles.progressFill, background: g.color, width: `${barPct}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.faint }}>
                        {t("home.todayProgress", { earned: earned.toFixed(2), cap })} •{" "}
                        {locked ? t("home.lockedTag", { time: cdText }) : t("home.gameReady")}
                      </span>
                    </div>
                    <button
                      onClick={() => openGame(g.key)}
                      disabled={locked}
                      className={`${locked ? "btn btn-ghost" : `btn ${g.btn}`} game-card-btn`}
                      style={{ padding: "10px 16px", fontSize: 13, whiteSpace: "nowrap" }}
                    >
                      {locked ? t("home.lockTimeBtn", { time: cdText }) : t("home.playBtn")}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: 560, margin: "0 auto", padding: "22px 18px 110px", display: "flex", flexDirection: "column", gap: 14, fontFamily: font, direction: "rtl" },
  // 🎨 البانر
  hero: {
    position: "relative", overflow: "hidden", borderRadius: 22, padding: "20px 18px",
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    background: "linear-gradient(135deg, rgba(0,255,204,0.13), rgba(124,92,255,0.16))",
    border: "1px solid rgba(0,255,204,0.22)", backdropFilter: "blur(14px)",
  },
  heroGlow: { position: "absolute", top: -60, left: -40, width: 230, height: 230, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,255,204,0.28), transparent 70%)", pointerEvents: "none" },
  heroTitle: { margin: 0, fontSize: 20, fontWeight: 900, color: C.text },
  heroSub: { margin: "6px 0 12px", color: C.muted, fontSize: 12.5, lineHeight: 1.7 },
  heroPills: { display: "flex", gap: 8, flexWrap: "wrap" },
  badgeLevel: { background: "rgba(0,255,204,0.1)", color: C.teal, padding: "7px 13px", fontSize: 11, border: "1px solid rgba(0,255,204,0.25)" },
  badgeGame: { background: "rgba(124,92,255,0.12)", color: "#b3a1ff", padding: "7px 13px", fontSize: 11, border: "1px solid rgba(124,92,255,0.3)" },
  // 💰 الرصيد
  balanceCard: { padding: "24px 20px", textAlign: "center", position: "relative", overflow: "hidden" },
  balanceLabel: { color: C.muted, fontSize: 12.5, display: "block", marginBottom: 6 },
  balanceValue: { fontSize: 32, margin: 0, fontWeight: 900, letterSpacing: "0.5px" },
  balanceUnit: { color: C.faint, fontSize: 10.5, fontWeight: 800, letterSpacing: 2, marginTop: 4, display: "block" },
  // 🏆 صندوق المستوى
  levelBox: { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)" },
  lbBadge: { width: 40, height: 40, borderRadius: 12, border: "1px solid", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  lbNum: { fontSize: 18, fontWeight: 900, lineHeight: 1 },
  lbName: { fontWeight: 800, fontSize: 13.5 },
  lbHint: { fontSize: 11, marginTop: 2 },
  // ⛏️ التعدين
  miningCard: { padding: "18px 18px 20px" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 900, color: C.text },
  statusActive: { background: "rgba(34,229,132,0.12)", color: C.green, border: "1px solid rgba(34,229,132,0.3)", padding: "5px 12px", fontSize: 11 },
  statusIdle: { background: "rgba(139,147,171,0.1)", color: C.muted, border: "1px solid rgba(139,147,171,0.25)", padding: "5px 12px", fontSize: 11 },
  miningBody: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", justifyContent: "center" },
  circleGlow: { borderRadius: "50%", padding: 5, background: "radial-gradient(circle at 30% 20%, rgba(0,255,204,0.35), rgba(124,92,255,0.15) 60%, transparent)", boxShadow: "0 0 34px rgba(0,255,204,0.14)" },
  circularProgressBar: { width: 168, height: 168, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.5s ease" },
  innerCircle: { width: 148, height: 148, background: "#070b16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  timerText: { fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: 1, fontVariantNumeric: "tabular-nums" },
  rateText: { fontSize: 10, marginTop: 6, fontWeight: 800 },
  stoppedText: { fontSize: 15, color: C.muted, fontWeight: 800 },
  miningInfo: { flex: 1, minWidth: 210, display: "flex", flexDirection: "column", gap: 14 },
  miningDesc: { color: C.muted, fontSize: 12, lineHeight: 1.8, margin: 0 },
  // 🎮 الألعاب
  gamesSection: { display: "flex", flexDirection: "column", gap: 14 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" },
  sectionTitle: { margin: 0, fontSize: 16, fontWeight: 900, color: C.text },
  sectionNote: { color: C.faint, fontSize: 10.5, fontWeight: 700 },
  gameArea: { padding: "14px 10px 8px" },
  gameHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sessionBox: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 },
  sessionValue: { fontSize: 17, fontWeight: 900 },
  levelCard: { display: "flex", gap: 16, alignItems: "center", padding: "18px 16px", flexWrap: "wrap", justifyContent: "center" },
  ringWrap: { flexShrink: 0 },
  ring: { width: 118, height: 118, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .5s ease" },
  ringInner: { width: 104, height: 104, borderRadius: "50%", background: "#070b16", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "0 6px", boxSizing: "border-box" },
  ringValue: { fontSize: 15, fontWeight: 900, color: C.text, whiteSpace: "nowrap", lineHeight: 1.3, textAlign: "center", maxWidth: "100%", padding: "0 2px" },
  ringXp: { fontSize: 10.5, color: C.muted, marginTop: 2, whiteSpace: "nowrap" },
  multPill: { background: "rgba(124,92,255,0.15)", color: C.purple, border: "1px solid rgba(124,92,255,0.35)", marginTop: 4, fontSize: 10, padding: "2px 10px" },
  levelInfo: { flex: 1, minWidth: 200, textAlign: "center" },
  levelTitle: { margin: 0, fontSize: 15, fontWeight: 900, color: C.text },
  levelDesc: { color: C.muted, fontSize: 11.5, margin: "5px 0 11px", lineHeight: 1.7 },
  statRow: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" },
  statCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px", minWidth: 86, textAlign: "center" },
  statLabel: { color: C.muted, fontSize: 10.5, display: "block" },
  statValue: { margin: "5px 0 0", fontSize: 14.5, color: C.text, fontWeight: 900 },
  gameList: { display: "flex", flexDirection: "column", gap: 12 },
  gameCard: { display: "flex", alignItems: "center", gap: 14, padding: "15px 16px", borderRadius: 18, flexWrap: "wrap" },
  gameIconWrap: { width: 52, height: 52, borderRadius: 14, border: "1px solid", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 },
  gameTitle: { margin: 0, fontSize: 14.5, fontWeight: 900, color: C.text },
  gameTagline: { color: C.muted, fontSize: 11.5, margin: "3px 0 8px" },
  progressTrack: { width: "100%", height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 5 },
  progressFill: { height: "100%", borderRadius: 999, transition: "width .4s ease" },
};
