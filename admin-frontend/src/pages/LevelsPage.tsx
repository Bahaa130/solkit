import { apiFetch } from "../lib/api";
import React, { useState, useEffect, useCallback } from "react";
import { C, font, styles as T } from "../theme";
import { useLang } from "../i18n/index.tsx";

interface LevelDef { level: number; name: string; minXp: number; color: string; miningRate: number; xpLogin?: number; xpTask?: number; xpGame?: number; xpRef?: number; xpMine?: number; xpBonus?: number }
interface LeaderRow { id: number; walletAddress: string | null; currentLevel: number; currentXp: number; activationStatus: string; }
interface MinerLeader { id: number; walletAddress: string | null; currentLevel: number; totalMined: number; sessionsCount: number; }
interface ReferrerLeader { id: number; walletAddress: string | null; currentLevel: number; referralsCount: number; }
interface GameLeader { id: number; walletAddress: string | null; currentLevel: number; gameLevel: number; totalEarned: number; playsCount: number; }

type LeaderboardTab = "xp" | "miners" | "referrers" | "games";

// 💡 طرق كسب نقاط النشاط للوصول للمستوى التالي — كل مستوى له قيمه الخاصة (يضبطها المدير)
const HOW_DEFAULTS: { label: string; key: string; pts: number }[] = [
  { label: "levels.actLogin", key: "xpLogin", pts: 10 },
  { label: "levels.actGame", key: "xpGame", pts: 5 },
  { label: "levels.actRef", key: "xpRef", pts: 50 },
  { label: "levels.actMine", key: "xpMine", pts: 30 },
  { label: "levels.actBonus", key: "xpBonus", pts: 15 },
];

const XP_EARNED_FIELDS: Record<string, string> = {
  xpLogin: "xpLoginEarned", xpGame: "xpGameEarned",
  xpRef: "xpRefEarned", xpMine: "xpMineEarned", xpBonus: "xpBonusEarned",
};

export default function LevelsPage({ userId, token }: { userId: number; token: string }) {
  const { t, dir } = useLang();
  const [plan, setPlan] = useState<LevelDef[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [me, setMe] = useState<{ currentLevel: number; currentXp: number; xpLoginEarned: number; xpTaskEarned: number; xpGameEarned: number; xpRefEarned: number; xpMineEarned: number; xpBonusEarned: number }>(
    { currentLevel: 1, currentXp: 0, xpLoginEarned: 0, xpTaskEarned: 0, xpGameEarned: 0, xpRefEarned: 0, xpMineEarned: 0, xpBonusEarned: 0 },
  );

  // 🏆 بيانات لوحة التصدر الموسعة
  const [activeLeaderTab, setActiveLeaderTab] = useState<LeaderboardTab>("xp");
  const [minersData, setMinersData] = useState<MinerLeader[]>([]);
  const [referrersData, setReferrersData] = useState<ReferrerLeader[]>([]);
  const [gamesData, setGamesData] = useState<GameLeader[]>([]);
  const [myRanks, setMyRanks] = useState<{ xp: { rank: number }; mining: { rank: number }; referrals: { rank: number }; games: { rank: number } } | null>(null);

  const [loading, setLoading] = useState(true);

  // جلب بيانات المستوى
  const fetchLevelData = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [lv, us] = await Promise.all([
        apiFetch("/api/users/levels", { headers }),
        apiFetch(`/api/users/${userId}`, { headers }),
      ]);
      if (lv.ok) { const d = await lv.json(); setPlan(d.plan || []); setLeaderboard(d.leaderboard || []); }
      if (us.ok) {
        const d = await us.json();
        setMe({
          currentLevel: Number(d.currentLevel || 1),
          currentXp: Number(d.currentXp || 0),
          xpLoginEarned: Number(d.xpLoginEarned || 0),
          xpTaskEarned: Number(d.xpTaskEarned || 0),
          xpGameEarned: Number(d.xpGameEarned || 0),
          xpRefEarned: Number(d.xpRefEarned || 0),
          xpMineEarned: Number(d.xpMineEarned || 0),
          xpBonusEarned: Number(d.xpBonusEarned || 0),
        });
      }
    } catch { /* تجاهل */ }
  }, [token, userId]);

  // جلب بيانات لوحة التصدر الموسعة
  const fetchLeaderboardData = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [miners, referrers, games, ranks] = await Promise.all([
        apiFetch("/api/leaderboard/miners", { headers }),
        apiFetch("/api/leaderboard/referrers", { headers }),
        apiFetch("/api/leaderboard/games", { headers }),
        apiFetch("/api/leaderboard/me", { headers }),
      ]);
      if (miners.ok) setMinersData(await miners.json());
      if (referrers.ok) setReferrersData(await referrers.json());
      if (games.ok) setGamesData(await games.json());
      if (ranks.ok) setMyRanks(await ranks.json());
    } catch { /* تجاهل */ }
  }, [token]);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchLevelData(), fetchLeaderboardData()]);
      setLoading(false);
    })();
  }, [fetchLevelData, fetchLeaderboardData]);

  if (loading) return <div style={{ ...T.page, textAlign: "center", color: C.muted }}>{t("common.loading")}</div>;

  const myLevel = plan.find((d) => d.level === me.currentLevel) || plan[0];
  const idx = plan.findIndex((d) => d.level === me.currentLevel);
  const next = idx >= 0 && idx < plan.length - 1 ? plan[idx + 1] : null;
  const curMin = myLevel?.minXp || 0;
  const nextMin = next?.minXp ?? curMin;
  const progress = next ? Math.max(0, Math.min(100, ((me.currentXp - curMin) / Math.max(1, nextMin - curMin)) * 100)) : 100;
  const color = myLevel?.color || C.teal;
  const gap = next ? Math.max(0, next.minXp - me.currentXp) : 0;

  const how = HOW_DEFAULTS.map((h) => {
    const fromRow = myLevel ? Number((myLevel as any)[h.key]) : 0;
    const pts = Number.isFinite(fromRow) && fromRow > 0 ? Math.round(fromRow) : h.pts;
    return { ...h, pts };
  });

  const short = (w: string | null) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || "—"));

  // 🏆 تبويبات لوحة التصدر
  const leaderTabs: { key: LeaderboardTab; icon: string; label: string }[] = [
    { key: "xp", icon: "🏆", label: t("leaderboard.xpTab") },
    { key: "miners", icon: "⛏️", label: t("leaderboard.minersTab") },
    { key: "referrers", icon: "👥", label: t("leaderboard.referrersTab") },
    { key: "games", icon: "🎮", label: t("leaderboard.gamesTab") },
  ];

  // بيانات اللوح النشط
  const getActiveLeaderData = () => {
    switch (activeLeaderTab) {
      case "xp": return leaderboard.map((u, i) => ({ ...u, rank: i + 1, value: u.currentXp }));
      case "miners": return minersData.map((u, i) => ({ ...u, rank: i + 1, value: u.totalMined, extra: `${u.sessionsCount} ${t("leaderboard.sessions")}` }));
      case "referrers": return referrersData.map((u, i) => ({ ...u, rank: i + 1, value: u.referralsCount }));
      case "games": return gamesData.map((u, i) => ({ ...u, rank: i + 1, value: u.totalEarned, extra: `${u.playsCount} ${t("leaderboard.plays")}` }));
    }
  };

  const activeData = getActiveLeaderData();

  return (
    <div style={{ ...styles.container, direction: dir }}>
      {/* 🏆 بطاقة المستوى الحالي */}
      <div className="glass" style={styles.hero}>
        <div style={styles.ring} >
          <div style={{ ...styles.ringInner, background: `conic-gradient(${color} ${progress}%, rgba(255,255,255,0.07) 0)` }}>
            <div style={styles.ringCore}>
              <span style={{ ...styles.heroLevel, color }}>{me.currentLevel}</span>
              <span style={styles.heroName}>{myLevel?.name}</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={styles.heroTitle}>{t("levels.yourLevel")}</h2>
          <div style={styles.xpRow}>
            <span style={{ color: C.muted, fontSize: 13 }}>{t("levels.xp")}</span>
            <span style={{ color: C.text, fontWeight: 800 }}>{me.currentXp}</span>
          </div>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${progress}%`, background: color }} />
          </div>
          <p style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>
            {next
              ? `${t("levels.toNext")} ${next.name} (${next.minXp - me.currentXp})`
              : t("levels.maxLevel")}
          </p>
        </div>
      </div>

      {/* 📊 ترتيبك الحالي في كل التصنيفات */}
      {myRanks && (
        <div className="glass" style={styles.myRanksCard}>
          <h3 style={styles.myRanksTitle}>📍 {t("leaderboard.yourRank")}</h3>
          <div style={styles.myRanksGrid}>
            <div style={styles.myRankItem}>
              <span style={{ fontSize: 20 }}>🏆</span>
              <span style={{ ...styles.myRankNum, color: C.amber }}>#{myRanks.xp.rank}</span>
              <span style={{ ...styles.myRankLabel, color: C.muted }}>XP</span>
            </div>
            <div style={styles.myRankItem}>
              <span style={{ fontSize: 20 }}>⛏️</span>
              <span style={{ ...styles.myRankNum, color: C.teal }}>#{myRanks.mining.rank || "—"}</span>
              <span style={{ ...styles.myRankLabel, color: C.muted }}>{t("leaderboard.minersTab")}</span>
            </div>
            <div style={styles.myRankItem}>
              <span style={{ fontSize: 20 }}>👥</span>
              <span style={{ ...styles.myRankNum, color: C.purple }}>#{myRanks.referrals.rank}</span>
              <span style={{ ...styles.myRankLabel, color: C.muted }}>{t("leaderboard.referrersTab")}</span>
            </div>
            <div style={styles.myRankItem}>
              <span style={{ fontSize: 20 }}>🎮</span>
              <span style={{ ...styles.myRankNum, color: C.green }}>#{myRanks.games.rank}</span>
              <span style={{ ...styles.myRankLabel, color: C.muted }}>{t("leaderboard.gamesTab")}</span>
            </div>
          </div>
        </div>
      )}

      {/* 💡 طريقة الوصول للمستوى التالي */}
      <div className="glass" style={styles.howCard}>
        <h3 style={styles.howTitle}>💡 {t("levels.howTitle")}</h3>
        <p style={{ ...styles.howDesc, color: C.muted }}>{t("levels.howDesc")}</p>
        <div style={styles.howList}>
          {how.map((it) => {
            const earned = Math.max(0, Number((me as any)[XP_EARNED_FIELDS[it.key]] || 0));
            const capped = Math.min(earned, gap);
            const cover = gap > 0 ? (capped / gap) * 100 : 100;
            const times = gap > 0 ? Math.max(0, Math.ceil(Math.max(0, gap - earned) / it.pts)) : 0;
            return (
              <div key={it.label} style={styles.howRow}>
                <span style={styles.howDot}>•</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ color: C.text, fontSize: 13 }}>{t(it.label)}</span>
                    <span style={{ ...styles.howPts, color }}>+{it.pts}</span>
                  </div>
                  <div style={styles.howBarTrack}>
                    <div style={{ ...styles.howBarFill, width: `${cover}%`, background: color }} />
                  </div>
                  <div style={styles.howHint}>
                    {gap > 0
                      ? `${t("levels.howEarned", { e: earned })} · ${t("levels.howNeed", { n: times })}`
                      : t("levels.maxLevel")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🪜 سُلّم المستويات */}
      <h3 style={styles.sectionTitle}>🪜 {t("levels.ladder")}</h3>
      <div style={styles.ladder}>
        {plan.map((d) => {
          const reached = me.currentXp >= d.minXp;
          const isMe = d.level === me.currentLevel;
          return (
            <div key={d.level} className="glass" style={{ ...styles.lvlCard, borderColor: isMe ? d.color : "rgba(255,255,255,0.08)", boxShadow: isMe ? `0 0 18px ${d.color}33` : "none" }}>
              <div style={{ ...styles.lvlBadge, background: d.color }}>{d.level}</div>
              <div style={{ flex: 1 }}>
                <div style={{ ...styles.lvlName, color: isMe ? d.color : C.text }}>{d.name}</div>
                <div style={{ ...styles.lvlMeta, color: C.muted }}>
                  {t("levels.minXp")}: {d.minXp} · ⛏️ {Number(d.miningRate).toFixed(2)}
                </div>
              </div>
              {!reached && <span style={styles.locked}>🔒</span>}
              {isMe && <span style={{ ...styles.meTag, color: d.color }}>{t("levels.you")}</span>}
            </div>
          );
        })}
      </div>

      {/* 🏆 لوحة التصدر الموسعة */}
      <h3 style={styles.sectionTitle}>🏆 {t("leaderboard.title")}</h3>

      {/* تبويبات التصنيفات */}
      <div style={styles.leaderTabs}>
        {leaderTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveLeaderTab(tab.key)}
            style={{
              ...styles.leaderTab,
              background: activeLeaderTab === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
              borderColor: activeLeaderTab === tab.key ? C.teal : "rgba(255,255,255,0.08)",
              color: activeLeaderTab === tab.key ? C.text : C.muted,
            }}
          >
            <span>{tab.icon}</span>
            <span style={{ fontSize: 12 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="glass" style={styles.board}>
        {activeData.length === 0 && <div style={{ ...styles.empty, color: C.green }}>{t("leaderboard.noData")}</div>}
        {activeData.map((r: any, i: number) => {
          const isMe = r.id === userId;
          return (
            <div key={r.id} style={{ ...styles.row, background: isMe ? "rgba(0,255,200,0.08)" : (i % 2 ? "rgba(255,255,255,0.02)" : "transparent"), border: isMe ? `1px solid ${C.teal}` : "1px solid transparent" }}>
              <span style={{ ...styles.rank, color: i < 3 ? C.amber : C.muted }}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : r.rank}
              </span>
              <span style={{ ...styles.wallet, color: isMe ? C.teal : C.text }}>
                {short(r.walletAddress)}
                {isMe && <span style={styles.youTag}> {t("leaderboard.you")}</span>}
              </span>
              <span style={{ ...styles.lvlChip, borderColor: (plan.find((d) => d.level === r.currentLevel)?.color) || C.muted }}>
                Lv.{r.currentLevel}
              </span>
              <span style={{ ...styles.xpVal, color: C.teal }}>
                {typeof r.value === "number"
                  ? (activeLeaderTab === "xp" || activeLeaderTab === "games"
                      ? r.value.toLocaleString()
                      : r.value.toFixed(4))
                  : r.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 16, maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18, fontFamily: font },
  hero: { display: "flex", gap: 18, alignItems: "center", padding: 20, borderRadius: 18 },
  ring: { width: 110, height: 110, flexShrink: 0 },
  ringInner: { width: "100%", height: "100%", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 },
  ringCore: { width: "100%", height: "100%", borderRadius: "50%", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  heroLevel: { fontSize: 34, fontWeight: 900, lineHeight: 1 },
  heroName: { fontSize: 11, color: C.muted, marginTop: 2 },
  heroTitle: { margin: "0 0 8px", fontSize: 16, color: C.text, fontWeight: 800 },
  xpRow: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  barTrack: { height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 6, overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", borderRadius: 6, transition: "width .4s ease" },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: 800, margin: "4px 0 0" },

  // 📊 ترتيب المستخدم
  myRanksCard: { padding: 16, borderRadius: 16 },
  myRanksTitle: { margin: "0 0 12px", fontSize: 14, color: C.text, fontWeight: 700, textAlign: "center" },
  myRanksGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  myRankItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  myRankNum: { fontSize: 16, fontWeight: 900 },
  myRankLabel: { fontSize: 10 },

  howCard: { padding: 18, borderRadius: 16 },
  howTitle: { color: C.text, fontSize: 15, fontWeight: 800, margin: "0 0 6px" },
  howDesc: { fontSize: 12.5, lineHeight: 1.7, margin: "0 0 12px" },
  howList: { display: "flex", flexDirection: "column", gap: 8 },
  howRow: { display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 12px" },
  howDot: { color: C.faint, fontSize: 16, lineHeight: 1.4 },
  howPts: { fontWeight: 900, fontSize: 13, fontFamily: "monospace", whiteSpace: "nowrap" },
  howBarTrack: { height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 999, overflow: "hidden", marginTop: 8 },
  howBarFill: { height: "100%", borderRadius: 999, transition: "width .4s ease" },
  howHint: { fontSize: 10.5, color: C.faint, marginTop: 5 },
  ladder: { display: "flex", flexDirection: "column", gap: 10 },
  lvlCard: { display: "flex", gap: 12, alignItems: "center", padding: 14, borderRadius: 14, border: "1px solid" },
  lvlBadge: { width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#0b0f17", fontWeight: 900, fontSize: 15 },
  lvlName: { fontWeight: 800, fontSize: 14 },
  lvlMeta: { fontSize: 12, marginTop: 2 },
  locked: { fontSize: 16 },
  meTag: { fontSize: 11, fontWeight: 800, marginLeft: "auto" },

  // 🏆 تبويبات لوحة التصدر
  leaderTabs: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  leaderTab: { display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 10, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .2s" },

  board: { borderRadius: 16, padding: 6, overflow: "hidden" },
  empty: { textAlign: "center", padding: 20, fontSize: 14, fontWeight: 700 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10 },
  rank: { width: 28, fontWeight: 900, fontSize: 14, textAlign: "center" },
  wallet: { flex: 1, fontFamily: "monospace", fontSize: 13, display: "flex", alignItems: "center", gap: 4 },
  youTag: { fontSize: 9, fontWeight: 700, color: C.teal, background: "rgba(0,255,200,0.1)", padding: "2px 6px", borderRadius: 6 },
  lvlChip: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, border: "1px solid" },
  xpVal: { fontWeight: 800, fontSize: 13, minWidth: 70, textAlign: "right" },
};
