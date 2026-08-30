import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font, styles as T } from "../theme";
import { useLang } from "../i18n/index.tsx";

interface LevelDef { level: number; name: string; minXp: number; color: string; miningRate: number; }
interface LeaderRow { id: number; walletAddress: string | null; currentLevel: number; currentXp: number; activationStatus: string; }

// 💡 طرق كسب نقاط النشاط للوصول للمستوى التالي — قيمها يتحكم بها المدير من إعدادات الموقع
const HOW_DEFAULTS: { label: string; key: string; pts: number }[] = [
  { label: "levels.actLogin", key: "xpLogin", pts: 10 },
  { label: "levels.actTask", key: "xpTask", pts: 25 },
  { label: "levels.actGame", key: "xpGame", pts: 5 },
  { label: "levels.actRef", key: "xpRef", pts: 50 },
  { label: "levels.actMine", key: "xpMine", pts: 30 },
];

export default function LevelsPage({ userId, token }: { userId: number; token: string }) {
  const { t, dir } = useLang();
  const [plan, setPlan] = useState<LevelDef[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [me, setMe] = useState<{ currentLevel: number; currentXp: number }>({ currentLevel: 1, currentXp: 0 });
  const [loading, setLoading] = useState(true);
  // 🎯 نقاط كسب النشاط — قيمها يتحكم بها المدير من إعدادات الموقع
  const [how, setHow] = useState(HOW_DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [lv, us, st] = await Promise.all([
          apiFetch("/api/users/levels", { headers }),
          apiFetch(`/api/users/${userId}`, { headers }),
          apiFetch("/api/users/settings"),
        ]);
        if (lv.ok) { const d = await lv.json(); setPlan(d.plan || []); setLeaderboard(d.leaderboard || []); }
        if (us.ok) { const d = await us.json(); setMe({ currentLevel: Number(d.currentLevel || 1), currentXp: Number(d.currentXp || 0) }); }
        if (st.ok) {
          const d = await st.json();
          setHow(HOW_DEFAULTS.map((h) => ({ ...h, pts: Number(d[h.key] ?? h.pts) })));
        }
      } catch { /* تجاهل */ }
      finally { setLoading(false); }
    })();
  }, [token, userId]);

  if (loading) return <div style={{ ...T.page, textAlign: "center", color: C.muted }}>{t("common.loading")}</div>;

  const myLevel = plan.find((d) => d.level === me.currentLevel) || plan[0];
  const idx = plan.findIndex((d) => d.level === me.currentLevel);
  const next = idx >= 0 && idx < plan.length - 1 ? plan[idx + 1] : null;
  const curMin = myLevel?.minXp || 0;
  const nextMin = next?.minXp ?? curMin;
  const progress = next ? Math.max(0, Math.min(100, ((me.currentXp - curMin) / Math.max(1, nextMin - curMin)) * 100)) : 100;
  const color = myLevel?.color || C.teal;
  const gap = next ? Math.max(0, next.minXp - me.currentXp) : 0;

  const short = (w: string | null) => (w && w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : (w || "—"));

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

      {/* 💡 طريقة الوصول للمستوى التالي */}
      <div className="glass" style={styles.howCard}>
        <h3 style={styles.howTitle}>💡 {t("levels.howTitle")}</h3>
        <p style={{ ...styles.howDesc, color: C.muted }}>{t("levels.howDesc")}</p>
        <div style={styles.howList}>
          {how.map((it) => {
            const times = gap > 0 ? Math.ceil(gap / it.pts) : 0;
            const cover = gap > 0 ? Math.min(100, (it.pts / gap) * 100) : 100;
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
                    {gap > 0 ? t("levels.howNeed", { n: times }) : t("levels.maxLevel")}
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

      {/* 🏅 لوحة القادة */}
      <h3 style={styles.sectionTitle}>🏅 {t("levels.leaderboard")}</h3>
      <div className="glass" style={styles.board}>
        {leaderboard.length === 0 && <div style={{ ...styles.empty, color: C.green }}>{t("levels.noData")}</div>}
        {leaderboard.map((r, i) => (
          <div key={r.id} style={{ ...styles.row, background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent" }}>
            <span style={{ ...styles.rank, color: i < 3 ? C.amber : C.muted }}>{i + 1}</span>
            <span style={{ ...styles.wallet, color: C.text }}>{short(r.walletAddress)}</span>
            <span style={{ ...styles.lvlChip, borderColor: (plan.find((d) => d.level === r.currentLevel)?.color) || C.muted }}>
              {t("levels.level")} {r.currentLevel}
            </span>
            <span style={{ ...styles.xpVal, color: C.teal }}>{r.currentXp}</span>
          </div>
        ))}
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
  board: { borderRadius: 16, padding: 6, overflow: "hidden" },
  empty: { textAlign: "center", padding: 20, fontSize: 14, fontWeight: 700 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10 },
  rank: { width: 28, fontWeight: 900, fontSize: 14 },
  wallet: { flex: 1, fontFamily: "monospace", fontSize: 13 },
  lvlChip: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, border: "1px solid" },
  xpVal: { fontWeight: 800, fontSize: 13, minWidth: 70, textAlign: "right" },
};
