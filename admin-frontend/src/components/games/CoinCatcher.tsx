// src/components/games/CoinCatcher.tsx
// 🪙🎯 لعبة اصطياد العملات — تظهر عملات (وقنابل أحياناً) في شبكة، التقط العملات قبل أن تختفي وتجنّب القنابل
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, font } from "../../theme";
import { useLang } from "../../i18n/index.tsx";
import { submitResult } from "./gamesApi";
import { formatCooldown } from "./gamesUtils";
import { useToast } from "../Toast";

interface CatchProps {
  token: string;
  multiplier: number;
  cooldown: number;
  onReward: (reward: number) => void;
  onStatusRefresh?: () => void;
}

const GRID = 9; // شبكة 3×3
const ROUND_SEC = 30;
const SPAWN_MS = 700; // تتحرك العملة كل 0.7 ثانية
const BOMB_CHANCE = 0.2; // 20% احتمال ظهور قنبلة

export default function CoinCatcher({ token, multiplier, cooldown, onReward, onStatusRefresh }: CatchProps) {
  const { dir, t } = useLang();
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SEC);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [bombCell, setBombCell] = useState<number | null>(null);
  const [bombed, setBombed] = useState(false);
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [remain, setRemain] = useState(cooldown);
  const toast = useToast();

  const scoreRef = useRef(0);
  const timeLeftRef = useRef(ROUND_SEC);
  const activeRef = useRef<number | null>(null);
  const bombRef = useRef<number | null>(null);
  const spawnIv = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeIv = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    setRemain(cooldown);
    if (cooldown <= 0) return;
    const iv = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(iv);
  }, [cooldown]);

  const clearTimers = useCallback(() => {
    if (spawnIv.current) clearInterval(spawnIv.current);
    if (timeIv.current) clearInterval(timeIv.current);
    spawnIv.current = null;
    timeIv.current = null;
  }, []);

  const spawnNow = useCallback(() => {
    const isBomb = Math.random() < BOMB_CHANCE;
    const cell = Math.floor(Math.random() * GRID);
    activeRef.current = isBomb ? null : cell;
    bombRef.current = isBomb ? cell : null;
    setActiveCell(activeRef.current);
    setBombCell(bombRef.current);
  }, []);

  const finishRound = useCallback(async () => {
    clearTimers();
    setPhase("done");
    setActiveCell(null);
    setBombCell(null);
    busyRef.current = false;
    if (scoreRef.current <= 0) {
      onStatusRefresh?.();
      return;
    }
    try {
      const res = await submitResult(token, { game: "catch", score: scoreRef.current });
      setLastReward(res.reward);
      if (res.reward > 0) onReward(res.reward);
      if (res.leveledUp) toast.success(t("game.levelUp", { level: res.gameLevel, m: res.multiplier.toFixed(2) }));
      onStatusRefresh?.();
    } catch (e: any) {
      toast.error(e.message || t("catch.error"));
      onStatusRefresh?.();
    }
  }, [token, onReward, onStatusRefresh, toast, t, clearTimers]);

  const startGame = () => {
    scoreRef.current = 0;
    timeLeftRef.current = ROUND_SEC;
    setScore(0);
    setTimeLeft(ROUND_SEC);
    setBombed(false);
    setLastReward(null);
    busyRef.current = false;
    setPhase("playing");
    spawnNow();
    spawnIv.current = setInterval(spawnNow, SPAWN_MS);
    timeIv.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) finishRound();
    }, 1000);
  };

  const handleCell = (i: number) => {
    if (phase !== "playing" || busyRef.current) return;
    if (i === bombRef.current) {
      clearTimers();
      setBombed(true);
      setPhase("done");
      setActiveCell(null);
      setBombCell(null);
      onStatusRefresh?.();
      return;
    }
    if (i === activeRef.current) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      spawnNow(); // استجابة فورية: تظهر العملة التالية في الحال
    }
  };

  useEffect(() => () => clearTimers(), [clearTimers]);

  const usable = phase !== "playing" && remain <= 0;

  const statusText = () => {
    if (phase === "playing") return t("catch.playing", { s: timeLeft, n: score });
    if (phase === "done") {
      if (bombed) return t("catch.bombHit");
      if (score > 0) return t("catch.doneReward", { r: (lastReward || 0).toFixed(2) });
      return t("catch.zero");
    }
    return t("catch.readyPrompt");
  };

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div style={styles.topBar}>
        <span className="pill" style={styles.scorePill}>🪙 {t("catch.caught", { n: score })}</span>
        <span className="pill" style={phase === "playing" ? styles.timePillActive : styles.timePill}>{t("catch.timeLeft", { n: timeLeft })}</span>
      </div>

      <p style={styles.status}>{statusText()}</p>

      <div style={styles.grid}>
        {Array.from({ length: GRID }).map((_, i) => {
          const isCoin = i === activeCell;
          const isBomb = i === bombCell;
          return (
            <button
              key={i}
              onClick={() => handleCell(i)}
              disabled={phase !== "playing"}
              style={{
                ...styles.cell,
                ...(isCoin ? styles.coin : {}),
                ...(isBomb ? styles.bomb : {}),
              }}
            >
              {isCoin ? "🪙" : isBomb ? "💣" : ""}
            </button>
          );
        })}
      </div>

      {phase !== "playing" && (
        <button onClick={startGame} disabled={!usable} className={usable ? "btn btn-amber" : "btn btn-ghost"} style={{ padding: "12px 28px", fontSize: 14 }}>
          {remain > 0 ? t("catch.wait", { time: formatCooldown(remain, t) }) : phase === "done" ? t("catch.playAgain") : t("catch.start")}
        </button>
      )}

      <p style={styles.hint}>{t("catch.hint", { m: multiplier.toFixed(2), v: (0.5 * multiplier).toFixed(3) })}</p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "6px 0 14px", fontFamily: font, direction: "rtl" },
  topBar: { display: "flex", gap: 10 },
  scorePill: { background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.3)", padding: "6px 16px", fontSize: 12, fontWeight: 700 },
  timePill: { background: "rgba(255,255,255,0.05)", color: C.muted, border: "1px solid rgba(255,255,255,0.1)", padding: "6px 16px", fontSize: 12, fontWeight: 700 },
  timePillActive: { background: "rgba(0,255,204,0.12)", color: C.teal, border: "1px solid rgba(0,255,204,0.3)", padding: "6px 16px", fontSize: 12, fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 92px)", gridTemplateRows: "repeat(3, 92px)", gap: 8 },
  cell: { borderRadius: 18, fontSize: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", cursor: "pointer", outline: "none", transition: "transform .08s ease, background .12s ease", userSelect: "none" },
  coin: { background: "radial-gradient(circle, rgba(255,176,32,0.35), rgba(255,176,32,0.12))", border: "1px solid rgba(255,176,32,0.5)", transform: "scale(1.04)" },
  bomb: { background: "radial-gradient(circle, rgba(255,77,77,0.35), rgba(255,77,77,0.12))", border: "1px solid rgba(255,77,77,0.5)" },
  hint: { color: C.muted, fontSize: 12 },
  status: { color: C.text, fontSize: 13, fontWeight: 700, minHeight: 20, textAlign: "center" as const, margin: "2px 0 0" },
};
