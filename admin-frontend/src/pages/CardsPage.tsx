// src/pages/CardsPage.tsx
import { apiFetch } from "../lib/api";
import React, { useState, useEffect, useRef } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useToast } from "../components/Toast";
import CoinBurst from "../components/CoinBurst";
import { useCoinBurst } from "../hooks/useCoinBurst";

interface CardInfo {
  key: string;
  icon: string;
  image: string | null;
  label: string;
  color: string;
  level: number;
  maxLevel: number;
  reward: number;
  cost: number;
  income: number;
  durationH: number;
  upgrading: boolean;
  upgradeEndsAt: string | null;
  upgradeTimeLeft: number;
}

export default function CardsPage({ token }: { userId: number; token: string }) {
  const { t, dir } = useLang();
  const toast = useToast();
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [balance, setBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [baseRate, setBaseRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingBump, setPendingBump] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const { bursts, trigger: triggerBurst } = useCoinBurst();
  const loadedAtRef = useRef(Date.now());
  const reloadingRef = useRef(false);

  const load = async (silent = false) => {
    try {
      const res = await apiFetch("/api/users/cards/list", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("load failed");
      const j = await res.json();
      setCards(j.cards || []);
      setBalance(Number(j.balance || 0));
      setTotalIncome(Number(j.totalIncome || 0));
      setBaseRate(Number(j.baseRate || 0));
      loadedAtRef.current = Date.now();
      setNow(Date.now());
    } catch {
      if (!silent) toast.error(t("cards.error"));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  // 🪙 تمرير لحظي لمؤثر تطاير العملة 3D عند النجاح في ترقية كارت — ينطلق من زر الترقية نفسه
  const fireBurst = (cardKey: string) => {
    try {
      const btn = document.getElementById(`upgrade-btn-${cardKey}`) as HTMLElement | null;
      const cardEl = document.getElementById(`card-${cardKey}`) as HTMLElement | null;
      const src = btn ?? cardEl;
      if (!src) return;
      const r = src.getBoundingClientRect();
      if (!r) return;
      const card = cards.find((x) => x.key === cardKey);
      const label = card ? `+${card.reward}` : undefined;
      triggerBurst(r, label);
      if (cardEl) {
        cardEl.classList.remove("card-upgraded-glow");
        void cardEl.offsetWidth; // إعادة تشغيل الوميض
        cardEl.classList.add("card-upgraded-glow");
      }
    } catch { /* تجاهل */ }
  };

  // ⏱️ عدّاد اللحظات: كل ثانية، وعند انتهاء أي فترة إعادة شحن معلّقة نعيد التحميل لمسح حالة "upgrading"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const anyDone = cards.some((c) => c.upgrading && c.upgradeTimeLeft > 0 && remainingOf(c) <= 0);
    if (anyDone && !reloadingRef.current) {
      reloadingRef.current = true;
      load(true).finally(() => { reloadingRef.current = false; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const remainingOf = (c: CardInfo): number => {
    if (!c.upgrading || !c.upgradeEndsAt) return 0;
    return Math.max(0, c.upgradeTimeLeft - Math.floor((now - loadedAtRef.current) / 1000));
  };

  const fmtDur = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const s2 = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s2}s`;
    return `${s2}s`;
  };

  const upgrade = async (cardKey: string) => {
    if (pendingBump) return;
    setPendingBump(cardKey);
    try {
      const res = await apiFetch("/api/users/cards/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardKey }),
      });
      const j = await res.json();
      if (res.ok) {
        toast.success(t("cards.startUpgrade"));
        fireBurst(cardKey);
        setBalance(Number(j.balance ?? balance));
        const endTs = j.upgradeDoneAt ? new Date(j.upgradeDoneAt).getTime() : Date.now() + Number(j.durationH || 1) * 3600000;
        setCards((prev) => prev.map((c) => c.key === cardKey
          ? {
            ...c,
            upgrading: true,
            level: Number(j.level ?? c.level),
            income: j.income !== undefined ? Number(j.income) : c.income,
            upgradeEndsAt: new Date(endTs).toISOString(),
            upgradeTimeLeft: Math.max(1, Math.floor((endTs - Date.now()) / 1000)),
          }
          : c));
        setTotalIncome(Number(j.totalIncome ?? totalIncome));
        loadedAtRef.current = Date.now();
        setNow(Date.now());
        load(true); // 🔄 تحديث بيانات الكروت المحدثة من الخادم (المستوى/التكلفة القادمة...)
      } else {
        toast.error(j.message || t("cards.error"));
        if (j.upgrading) { /* تنبيه الترقية قيد العدّاد من الخادم */ }
      }
    } catch {
      toast.error(t("cards.error"));
    } finally {
      setPendingBump(null);
    }
  };

  if (loading) {
    return <div style={{ ...styles.container, textAlign: "center", color: C.muted }}>{t("common.loading")}</div>;
  }

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n || 0);

  return (
    <div style={{ ...styles.container, direction: dir }}>
      <div className="glass" style={styles.hero}>
        <h3 style={styles.title}>📈 {t("cards.title")}</h3>
        <p style={styles.sub}>{t("cards.subtitle")}</p>
        <div style={styles.heroStats}>
          <div style={styles.heroStat}>
            <span style={styles.heroStatLabel}>{t("cards.balance")}</span>
            <span style={{ ...styles.heroStatValue, color: C.green }}>{fmt(balance)} Ⓢ</span>
          </div>
          <div style={styles.heroStat}>
            <span style={styles.heroStatLabel}>{t("cards.incomePerHour")} (24h)</span>
            <span style={{ ...styles.heroStatValue, color: "#f59e0b" }}>+{fmt(totalIncome)}</span>
          </div>
          <div style={styles.heroStat}>
            <span style={styles.heroStatLabel}>{t("cards.effectiveRate")}</span>
            <span style={{ ...styles.heroStatValue, color: C.teal }}>{fmt(baseRate + totalIncome)}</span>
          </div>
        </div>
      </div>

      <div style={styles.grid}>
        {cards.map((c) => {
          const maxed = c.level >= c.maxLevel;
          const affordable = c.cost > 0 && balance >= c.cost;
          const pct = Math.min(100, Math.round((c.level / Math.max(1, c.maxLevel)) * 100));
          const pending = c.upgrading;
          const left = pending ? remainingOf(c) : 0;
          const durPct = pending && c.durationH > 0
            ? Math.min(100, Math.round(((c.durationH * 3600 - left) / (c.durationH * 3600)) * 100))
            : 0;
          return (
            <div key={c.key} id={`card-${c.key}`} className="glass" style={styles.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                {c.image ? (
                  <img src={c.image} alt={c.label} style={{ ...styles.icon, objectFit: "cover" }} />
                ) : (
                  <span style={{ ...styles.icon, background: `${c.color}22`, border: `1px solid ${c.color}55` }}>{c.icon}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", color: C.text, fontWeight: 900, fontSize: 13 }}>{c.label}</span>
                  <span style={{ display: "block", color: c.color, fontWeight: 800, fontSize: 12 }}>
                    {t("cards.income")}: +{fmt(c.reward)} / 24h
                  </span>
                </div>
                <span style={{ color: C.muted, fontSize: 11.5, fontWeight: 700 }}>
                  {t("cards.level")} {c.level}/{c.maxLevel}
                </span>
              </div>

              <div style={{ ...styles.barTrack, marginBottom: 10 }}>
                <div style={{ ...styles.barFill, width: pending ? `${durPct}%` : `${pct}%`, background: pending ? "#f59e0b" : c.color }} />
              </div>

              {maxed ? (
                <div style={styles.maxTag}>{t("cards.maxReached")} ✅</div>
              ) : pending ? (
                <div style={styles.pendingTag}>
                  <span style={{ color: "#f59e0b", fontWeight: 900, fontSize: 13 }}>⏳ {t("cards.pending")}</span>
                  <span style={{ color: C.muted, fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>
                    {t("cards.timeLeft")}: {fmtDur(left)}
                  </span>
                </div>
              ) : (
                <>
                  <button
                    id={`upgrade-btn-${c.key}`}
                    onClick={() => upgrade(c.key)}
                    disabled={!affordable || !!pendingBump}
                    className="btn btn-primary"
                    style={{
                      width: "100%", padding: "11px", fontSize: 13, fontWeight: 900, borderRadius: 12,
                      opacity: affordable ? 1 : 0.55, pointerEvents: affordable ? "auto" : "none",
                    }}
                  >
                    {pendingBump === c.key ? t("common.loading") : t("cards.upgrade")}
                    {c.cost > 0 ? ` — ${fmt(c.cost)} Ⓢ` : ""}
                  </button>
                  <p style={{ margin: "6px 0 0", color: C.faint, fontSize: 10.5, textAlign: "center" }}>
                    ⏲️ {t("cards.durationH", { h: c.durationH })}
                  </p>
                  {!affordable && (
                    <p style={{ margin: "2px 0 0", color: C.faint, fontSize: 11, textAlign: "center" }}>
                      {t("cards.nextCost")} {fmt(c.cost)} Ⓢ
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <CoinBurst bursts={bursts} />
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 720, margin: "0 auto", fontFamily: font, width: "100%", minWidth: 0, boxSizing: "border-box" },
  hero: { borderRadius: 18, padding: "18px 18px 16px" },
  title: { margin: "0 0 6px", fontSize: 16, fontWeight: 900, color: C.text },
  sub: { margin: "0 0 14px", color: C.muted, fontSize: 12, lineHeight: 1.7 },
  heroStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 },
  heroStat: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", textAlign: "center" },
  heroStatLabel: { display: "block", color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 },
  heroStatValue: { fontSize: 15, fontWeight: 900 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
  card: { borderRadius: 16, padding: "14px 14px 12px", minWidth: 0 },
  icon: { fontSize: 24, width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  barTrack: { background: "rgba(255,255,255,0.06)", borderRadius: 8, height: 8, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 8 },
  maxTag: { textAlign: "center", color: "#22e584", fontSize: 13, fontWeight: 900, padding: "11px", border: "1px solid rgba(34,229,132,0.3)", borderRadius: 12, background: "rgba(34,229,132,0.08)" },
  pendingTag: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "9px", border: "1px dashed rgba(245,158,11,0.45)", borderRadius: 12, background: "rgba(245,158,11,0.08)", textAlign: "center" },
};