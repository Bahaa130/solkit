// src/components/ProjectAnalytics.tsx
import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";

interface AnalyticsData {
  users: { total: number; activated: number; pending: number; inactive: number; new7: number; new30: number; wallets: number };
  mining: { active: number; completed: number; total: number; minedTotal: number };
  games: { plays: number; rewardTotal: number; byType: { wheel: { plays: number; reward: number }; tap: { plays: number; reward: number }; catch: { plays: number; reward: number } } };
  bonuses: { claims: number; rewardTotal: number };
  referrals: { total: number; activated: number };
  tasks: { done: number; rewardTotal: number };
  payments: { paid: number; revenue: number };
  rewards: { count: number; amountTotal: number };
  balances: { total: number };
  levels: { level: number; users: number }[];
}

const fmtN = (n: number): string => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n || 0);
const fmtSmall = (n: number): string => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n || 0);

export default function ProjectAnalytics({ token }: { token: string }) {
  const { t } = useLang();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await apiFetch("/api/users/admin/analytics", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("load failed");
        const j = await res.json();
        if (mounted) {
          setData(j);
          setError(null);
        }
      } catch {
        if (mounted) setError(t("admin.analyticsError"));
      }
    };
    load();
    return () => { mounted = false; };
  }, [token]);

  if (error) {
    return (
      <div className="glass" style={{ padding: 20, textAlign: "center" }}>
        <p style={{ color: "#ff9cae", fontSize: 13, fontWeight: 800, margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass" style={{ padding: 20, textAlign: "center" }}>
        <p style={{ color: C.muted, fontSize: 13, fontWeight: 700, margin: 0 }}>{t("common.loading")}</p>
      </div>
    );
  }

  const u = data.users;
  const g = data.games;
  const levels = [...(data.levels || [])].sort((a, b) => a.level - b.level);
  const maxLevelUsers = Math.max(1, ...levels.map((l) => l.users));

  const Section = ({ icon, label, children, color }: { icon: string; label: string; children: React.ReactNode; color: string }) => (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: C.text }}>{label}</h4>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      </div>
      {children}
    </div>
  );

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 2px", borderBottom: "1px dashed rgba(255,255,255,0.07)" }}>
      <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 700 }}>{label}</span>
      <span style={{ color: color || C.text, fontSize: 13, fontWeight: 900 }}>{value}</span>
    </div>
  );

  const Metric = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ minWidth: 0, flex: "1 1 110px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
      <span style={{ display: "block", color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{label}</span>
      <span style={{ color: color || C.text, fontSize: 15, fontWeight: 900 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: font, width: "100%", minWidth: 0 }}>
      <div className="glass" style={{ padding: 18, borderRadius: 18 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 900, color: C.text }}>
          📈 {t("admin.analyticsTitle")}
        </h3>
        <p style={{ margin: 0, color: C.muted, fontSize: 12, lineHeight: 1.7 }}>{t("admin.analyticsSub")}</p>
      </div>

      <Section icon="👥" label={t("admin.analyticsUsers")} color="#7c5cff">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Metric label={t("admin.totalUsers")} value={`${fmtN(u.total)}`} color={C.text} />
          <Metric label={t("admin.analyticsActivated")} value={`${fmtN(u.activated)}`} color="#22e584" />
          <Metric label={t("admin.analyticsPending")} value={`${fmtN(u.pending)}`} color="#ffb020" />
          <Metric label={t("admin.analyticsInactive")} value={`${fmtN(u.inactive)}`} color={C.muted} />
        </div>
        <div style={{ height: 10 }} />
        <Row label={t("admin.analyticsNew7")} value={`${fmtN(u.new7)}`} />
        <Row label={t("admin.analyticsNew30")} value={`${fmtN(u.new30)}`} />
        <Row label={t("admin.analyticsWallets")} value={`${fmtN(u.wallets)}`} color={C.teal} />
      </Section>

      <Section icon="⛏️" label={t("admin.analyticsMining")} color="#00ffcc">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Metric label={t("admin.analyticsMiningActive")} value={`${fmtN(data.mining.active)}`} color={C.amber} />
          <Metric label={t("admin.analyticsMiningDone")} value={`${fmtN(data.mining.completed)}`} />
          <Metric label={t("admin.analyticsMined")} value={`${fmtSmall(data.mining.minedTotal)} Ⓢ`} color="#00ffcc" />
        </div>
      </Section>

      <Section icon="🎮" label={t("admin.analyticsGames")} color="#a855f7">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Metric label={t("admin.analyticsPlays")} value={`${fmtN(g.plays)}`} color={C.amber} />
          <Metric label={t("admin.analyticsRewards")} value={`${fmtSmall(g.rewardTotal)} Ⓢ`} color="#a855f7" />
        </div>
        {([
          ["🎡", "wheel", g.byType.wheel],
          ["👆", "tap", g.byType.tap],
          ["🧺", "catch", g.byType.catch],
        ] as const).map(([ic, key, item]) => (
          <Row key={key} label={`${ic} ${t(`game.${key}Title`)}`} value={`${fmtN(item.plays)} ${t("admin.analyticsPlays")} — ${fmtSmall(item.reward)} Ⓢ`} color="#a855f7" />
        ))}
      </Section>

      <Section icon="🎁" label={t("admin.analyticsBonus")} color="#ffb020">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Metric label={t("admin.analyticsClaims")} value={`${fmtN(data.bonuses.claims)}`} />
          <Metric label={t("admin.analyticsRewards")} value={`${fmtSmall(data.bonuses.rewardTotal)} Ⓢ`} color="#ffb020" />
        </div>
      </Section>

      <Section icon="🤝" label={t("admin.analyticsReferrals")} color="#22e584">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Metric label={t("admin.analyticsReferred")} value={`${fmtN(data.referrals.total)}`} />
          <Metric label={t("admin.analyticsActivatedRefs")} value={`${fmtN(data.referrals.activated)}`} color="#22e584" />
        </div>
      </Section>

      <Section icon="📋" label={t("admin.analyticsTasks")} color="#38bdf8">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Metric label={t("admin.analyticsDone")} value={`${fmtN(data.tasks.done)}`} />
          <Metric label={t("admin.analyticsRewards")} value={`${fmtSmall(data.tasks.rewardTotal)} Ⓢ`} color="#38bdf8" />
        </div>
      </Section>

      <Section icon="💰" label={t("admin.analyticsMoney")} color="#ff5c7a">
        <Row label={t("admin.analyticsPaidRevenue")} value={`${fmtN(data.payments.paid)} ${t("admin.unitRequests")} — ${fmtSmall(data.payments.revenue)} SOL`} color="#ffb020" />
        <Row label={t("admin.analyticsBalance")} value={`${fmtSmall(data.balances.total)} Ⓢ`} color="#ff5c7a" />
        <Row label={t("admin.analyticsRewardLog")} value={`${fmtN(data.rewards.count)} ${t("admin.analyticsUsersCount")} — ${fmtSmall(data.rewards.amountTotal)} Ⓢ`} color="#22e584" />
      </Section>

      {levels.length > 0 && (
        <Section icon="📊" label={t("admin.analyticsLevels")} color="#7c5cff">
          {levels.map((l) => (
            <div key={l.level} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 58, flexShrink: 0, color: C.muted, fontSize: 12, fontWeight: 800 }}>
                {t("levels.level")} {l.level}
              </span>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((l.users / maxLevelUsers) * 100)}%`, minWidth: l.users > 0 ? 14 : 0, height: "100%", background: "linear-gradient(90deg, #7c5cff, #a855f7)", borderRadius: 8 }} />
              </div>
              <span style={{ width: 44, flexShrink: 0, textAlign: "left", color: C.text, fontSize: 12.5, fontWeight: 900 }}>{fmtN(l.users)}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}