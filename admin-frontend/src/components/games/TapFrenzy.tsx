// src/components/games/TapFrenzy.tsx
// 👆 تحدي سرعة النقر — شبكة 3×3، اضرب الهدف قبل انتقاله، والصعوبة تتدرج
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, font } from "../../theme";
import { useLang } from "../../i18n/index.tsx";
import { submitResult } from "./gamesApi";
import { formatCooldown } from "./gamesUtils";
import { CoinLayer } from "./CoinLayer";
import type { CoinLayerHandle } from "./CoinLayer";
import { useToast } from "../Toast";

interface TapFrenzyProps {
  token: string;
  multiplier: number;
  cooldown: number;
  onReward: (reward: number, x?: number, y?: number) => void;
  onStatusRefresh?: () => void;
}

const ROUND_SECONDS = 15;
const MIN_LIFETIME = 300;

export default function TapFrenzy({ token, multiplier, cooldown, onReward, onStatusRefresh }: TapFrenzyProps) {
  const { dir, t } = useLang();
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [target, setTarget] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [hitIdx, setHitIdx] = useState<number | null>(null);
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [remain, setRemain] = useState(cooldown);

  const coinRef = useRef<CoinLayerHandle>(null);
  const lifetimeRef = useRef(900);
  const scoreRef = useRef(0);
  const targetRef = useRef<number | null>(null);
  const toast = useToast();

  // عدّاد تنازلي محلي للكولدون
  useEffect(() => {
    setRemain(cooldown);
    if (cooldown <= 0) return;
    const iv = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(iv);
  }, [cooldown]);

  // انتقال الهدف لمكان عشوائي مختلف
  const relocate = useCallback(() => {
    let next = Math.floor(Math.random() * 9);
    if (next === targetRef.current) next = (next + 1) % 9;
    targetRef.current = next;
    setTarget(next);
  }, []);

  const endGame = useCallback(async () => {
    setPhase("done");
    setTarget(null);
    const finalScore = scoreRef.current;
    if (finalScore <= 0) {
      toast.info(t("tap.zero"));
      onStatusRefresh?.();
      return;
    }
    try {
      const res = await submitResult(token, { game: "tap", score: finalScore });
      setLastReward(res.reward);
      if (res.reward > 0) onReward(res.reward, 50, 40);
      if (res.leveledUp) toast.success(t("game.levelUp", { level: res.gameLevel, m: res.multiplier.toFixed(2) }));
      onStatusRefresh?.();
    } catch (e: any) {
      toast.error(e.message || t("tap.error"));
      onStatusRefresh?.();
    }
  }, [token, onReward, onStatusRefresh, toast, t]);

  // ⏱️ مؤقت الجولة
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  // انتهاء الوقت → تسوية الجولة
  useEffect(() => {
    if (phase === "running" && timeLeft <= 0) endGame();
  }, [timeLeft, phase, endGame]);

  // ⏲️ مدة بقاء الهدف — إن لم يُضرب ينتقل لمكان آخر
  useEffect(() => {
    if (phase !== "running" || target === null) return;
    const t = setTimeout(relocate, lifetimeRef.current);
    return () => clearTimeout(t);
  }, [target, phase, relocate]);

  // إزالة ومضة الإصابة بعد انتهاء حركتها
  useEffect(() => {
    if (hitIdx === null) return;
    const t = setTimeout(() => setHitIdx(null), 260);
    return () => clearTimeout(t);
  }, [hitIdx]);

  const startGame = () => {
    setPhase("running");
    setTimeLeft(ROUND_SECONDS);
    scoreRef.current = 0;
    setScore(0);
    setLastReward(null);
    lifetimeRef.current = 900;
    relocate();
  };

  const handleHit = (idx: number) => {
    if (phase !== "running" || idx !== target) return;
    const newScore = scoreRef.current + 1;
    scoreRef.current = newScore;
    setScore(newScore);
    lifetimeRef.current = Math.max(MIN_LIFETIME, lifetimeRef.current - 20); // الصعوبة تتدرج
    setHitIdx(idx);
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    onReward(0.2 * multiplier, 16.6 + col * 33.3, 14 + row * 26);
    relocate();
  };

  const usable = phase !== "running" && remain <= 0;

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div style={styles.topBar}>
        <span className="pill" style={styles.scorePill}>{t("tap.round", { n: score })}</span>
        <span className="pill" style={phase === "running" ? styles.timePillActive : styles.timePill}>{t("tap.time", { n: timeLeft })}</span>
      </div>

      <div className="tap-area" style={styles.area}>
        <CoinLayer ref={coinRef} />
        {phase !== "running" && (
          <div style={styles.overlay}>
            {phase === "done" && lastReward !== null ? (
              <p style={styles.doneText}>{t("tap.doneReward", { r: lastReward.toFixed(2) })}</p>
            ) : (
              <p style={styles.doneText}>{t("tap.readyPrompt")}</p>
            )}
            <button onClick={startGame} disabled={!usable} className={usable ? "btn btn-green" : "btn btn-ghost"} style={{ padding: "12px 28px", fontSize: 14 }}>
              {remain > 0 ? t("tap.wait", { time: formatCooldown(remain, t) }) : phase === "done" ? t("tap.playAgain") : t("tap.start")}
            </button>
          </div>
        )}

        <div style={styles.grid}>
          {Array.from({ length: 9 }).map((_, i) => {
            const isTarget = phase === "running" && target === i;
            return (
              <button
                key={i}
                onClick={() => handleHit(i)}
                className={hitIdx === i ? "tile-hit" : ""}
                style={{
                  ...styles.tile,
                  background: isTarget ? "radial-gradient(circle at 30% 20%, rgba(34,229,132,0.9), rgba(0,184,255,0.6))" : "rgba(255,255,255,0.05)",
                  border: isTarget ? "1px solid rgba(34,229,132,0.8)" : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: isTarget ? "0 0 20px rgba(34,229,132,0.5)" : "none",
                  cursor: phase === "running" ? "pointer" : "default",
                }}
              >
                {isTarget ? "🎯" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <p style={styles.hint}>{t("tap.hint", { m: multiplier.toFixed(2), v: (0.2 * multiplier).toFixed(3) })}</p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "6px 0 14px", fontFamily: font, direction: "rtl" },
  topBar: { display: "flex", gap: 10 },
  scorePill: { background: "rgba(34,229,132,0.12)", color: C.green, border: "1px solid rgba(34,229,132,0.3)", padding: "6px 14px", fontSize: 12 },
  timePill: { background: "rgba(139,147,171,0.12)", color: C.muted, border: "1px solid rgba(139,147,171,0.25)", padding: "6px 14px", fontSize: 12 },
  timePillActive: { background: "rgba(0,255,204,0.12)", color: C.teal, border: "1px solid rgba(0,255,204,0.3)", padding: "6px 14px", fontSize: 12 },
  area: { position: "relative", width: 270, height: 270 },
  overlay: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, zIndex: 30, background: "rgba(7,11,22,0.72)", borderRadius: 18, backdropFilter: "blur(4px)" },
  doneText: { color: C.text, fontSize: 15, fontWeight: 800, margin: 0, textAlign: "center", padding: "0 14px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", height: "100%" },
  tile: { borderRadius: 16, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.08)", transition: "all .15s ease", outline: "none" },
  hint: { color: C.muted, fontSize: 12 },
};
