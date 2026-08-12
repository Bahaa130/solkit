// src/components/games/CoinCatch.tsx
// 🪙 اصطياد العملات — أركيد بحلقة requestAnimationFrame: التقط العملات وتجنب القنابل
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, font } from "../../theme";
import { useLang } from "../../i18n/index.tsx";
import { submitResult } from "./gamesApi";
import { formatCooldown } from "./gamesUtils";
import { CoinLayer } from "./CoinLayer";
import type { CoinLayerHandle } from "./CoinLayer";
import { useToast } from "../Toast";

interface CoinCatchProps {
  token: string;
  multiplier: number;
  cooldown: number;
  onReward: (reward: number, x?: number, y?: number) => void;
  onStatusRefresh?: () => void;
}

interface FallItem {
  id: number;
  type: "coin" | "bomb";
  x: number; // نسبة مئوية
  y: number;
  vy: number; // نسبة مئوية/ثانية
}

const ROUND_SECONDS = 30;
const MAX_LIVES = 3;
const COIN_VALUE = 0.1;

export default function CoinCatch({ token, multiplier, cooldown, onReward, onStatusRefresh }: CoinCatchProps) {
  const { dir, t } = useLang();
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [items, setItems] = useState<FallItem[]>([]);
  const [basketX, setBasketX] = useState(50);
  const [lives, setLives] = useState(MAX_LIVES);
  const [caught, setCaught] = useState(0);
  const [shake, setShake] = useState(false);
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [remain, setRemain] = useState(cooldown);

  const coinRef = useRef<CoinLayerHandle>(null);
  const itemsRef = useRef<FallItem[]>([]);
  const basketXRef = useRef(50);
  const caughtRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const multRef = useRef(multiplier);
  const idRef = useRef(0);
  const rafRef = useRef<number>(0);
  const onRewardRef = useRef(onReward);
  const toast = useToast();

  // مزامنة المراجع الحية
  useEffect(() => { multRef.current = multiplier; }, [multiplier]);
  useEffect(() => { onRewardRef.current = onReward; }, [onReward]);

  // عدّاد تنازلي محلي للكولدون
  useEffect(() => {
    setRemain(cooldown);
    if (cooldown <= 0) return;
    const iv = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(iv);
  }, [cooldown]);

  const endGame = useCallback(async () => {
    setPhase("done");
    setItems([]);
    itemsRef.current = [];
    const finalScore = caughtRef.current;
    if (finalScore <= 0) {
      toast.info(t("catch.zero"));
      onStatusRefresh?.();
      return;
    }
    try {
      const res = await submitResult(token, { game: "catch", score: finalScore });
      setLastReward(res.reward);
      if (res.reward > 0) onRewardRef.current(res.reward, 50, 30);
      if (res.leveledUp) toast.success(t("game.levelUp", { level: res.gameLevel, m: res.multiplier.toFixed(2) }));
      onStatusRefresh?.();
    } catch (e: any) {
      toast.error(e.message || t("catch.error"));
      onStatusRefresh?.();
    }
  }, [token, onStatusRefresh, toast, t]);

  // ⏱️ مؤقت الجولة
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  // انتهاء الوقت أو فقدان كل الحيوات → تسوية الجولة
  useEffect(() => {
    if (phase !== "running") return;
    if (timeLeft <= 0 || lives <= 0) endGame();
  }, [timeLeft, lives, phase, endGame]);

  // 🌀 حلقة اللعب (rAF مع delta-time)
  useEffect(() => {
    if (phase !== "running") return;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const moved = itemsRef.current.map((it) => ({ ...it, y: it.y + it.vy * dt }));
      const bx = basketXRef.current;
      const kept: FallItem[] = [];
      let coins = 0;
      let bombs = 0;
      for (const it of moved) {
        if (it.y >= 82 && Math.abs(it.x - bx) < 14) {
          if (it.type === "coin") coins++;
          else bombs++;
          continue;
        }
        if (it.y > 104) continue; // سقط أسفل الشاشة
        kept.push(it);
      }

      if (coins > 0) {
        caughtRef.current += coins;
        setCaught((c) => c + coins);
        onRewardRef.current(COIN_VALUE * multRef.current * coins, Math.min(92, Math.max(8, bx)), 80);
      }
      if (bombs > 0) {
        livesRef.current = Math.max(0, livesRef.current - bombs);
        setLives(livesRef.current);
        setShake(true);
        coinRef.current?.pop(0, Math.min(92, Math.max(8, bx)), 80, t("catch.bomb"));
      }

      itemsRef.current = kept;
      setItems(kept);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // إيقاف الاهتزاز
  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [shake]);

  // 🎁 مولّد العملات والقنابل
  useEffect(() => {
    if (phase !== "running") return;
    const spawn = (type: "coin" | "bomb") => {
      itemsRef.current.push({
        id: ++idRef.current,
        type,
        x: 6 + Math.random() * 88,
        y: -6,
        vy: type === "coin" ? 16 + Math.random() * 9 : 22 + Math.random() * 7,
      });
      setItems([...itemsRef.current]);
    };
    const coinIv = setInterval(() => spawn("coin"), 520);
    const bombIv = setInterval(() => { if (Math.random() < 0.45) spawn("bomb"); }, 1800);
    return () => { clearInterval(coinIv); clearInterval(bombIv); };
  }, [phase]);

  // 🧺 تحريك السلة بالماوس/اللمس وأسهم لوحة المفاتيح
  const handleMove = (clientX: number, rect: DOMRect) => {
    const pct = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(92, Math.max(8, pct));
    basketXRef.current = clamped;
    setBasketX(clamped);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "running") return;
      const step = 6;
      const next = e.key === "ArrowLeft" ? basketXRef.current - step : e.key === "ArrowRight" ? basketXRef.current + step : basketXRef.current;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const clamped = Math.min(92, Math.max(8, next));
        basketXRef.current = clamped;
        setBasketX(clamped);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const startGame = () => {
    setPhase("running");
    setTimeLeft(ROUND_SECONDS);
    itemsRef.current = [];
    setItems([]);
    caughtRef.current = 0;
    setCaught(0);
    livesRef.current = MAX_LIVES;
    setLives(MAX_LIVES);
    setLastReward(null);
    setShake(false);
  };

  const usable = phase !== "running" && remain <= 0;

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div style={styles.topBar}>
        <span className="pill" style={styles.caughtPill}>{t("catch.caughtPill", { n: caught })}</span>
        <span className="pill" style={styles.livesPill}>
          {"❤️".repeat(Math.max(0, lives))}{"🖤".repeat(Math.max(0, MAX_LIVES - lives))}
        </span>
        <span className="pill" style={phase === "running" ? styles.timePillActive : styles.timePill}>{t("catch.time", { n: timeLeft })}</span>
      </div>

      <div
        className={(shake ? "shake " : "") + "catch-area"}
        style={styles.area}
        onPointerMove={(e) => phase === "running" && handleMove(e.clientX, e.currentTarget.getBoundingClientRect())}
      >
        <CoinLayer ref={coinRef} />

        {phase !== "running" && (
          <div style={styles.overlay}>
            {phase === "done" && lastReward !== null ? (
              <p style={styles.doneText}>{t("catch.doneReward", { r: lastReward.toFixed(2) })}</p>
            ) : (
              <p style={styles.doneText}>{t("catch.overlay")}</p>
            )}
            <button onClick={startGame} disabled={!usable} className={usable ? "btn btn-amber" : "btn btn-ghost"} style={{ padding: "12px 28px", fontSize: 14 }}>
              {remain > 0 ? t("catch.wait", { time: formatCooldown(remain, t) }) : phase === "done" ? t("catch.playAgain") : t("catch.start")}
            </button>
          </div>
        )}

        {/* العملات والقنابل المتساقطة */}
        {items.map((it) => (
          <span
            key={it.id}
            className="floaty"
            style={{ position: "absolute", left: `${it.x}%`, top: `${it.y}%`, transform: "translate(-50%,-50%)", fontSize: it.type === "coin" ? 24 : 26, animationDuration: "0s", pointerEvents: "none" }}
          >
            {it.type === "coin" ? "🪙" : "💣"}
          </span>
        ))}

        {/* السلة */}
        <div style={{ position: "absolute", bottom: 2, left: `${basketX}%`, transform: "translateX(-50%)", fontSize: 38, pointerEvents: "none", filter: "drop-shadow(0 0 10px rgba(0,255,204,0.35))" }}>
          🧺
        </div>
      </div>

      <p style={styles.hint}>{t("catch.hint", { m: multiplier.toFixed(2), v: (COIN_VALUE * multiplier).toFixed(3) })}</p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "6px 0 14px", fontFamily: font, direction: "rtl" },
  topBar: { display: "flex", gap: 10 },
  caughtPill: { background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.3)", padding: "6px 14px", fontSize: 12 },
  livesPill: { background: "rgba(255,92,122,0.1)", color: "#ff5c7a", border: "1px solid rgba(255,92,122,0.25)", padding: "6px 12px", fontSize: 12 },
  timePill: { background: "rgba(139,147,171,0.12)", color: C.muted, border: "1px solid rgba(139,147,171,0.25)", padding: "6px 14px", fontSize: 12 },
  timePillActive: { background: "rgba(0,255,204,0.12)", color: C.teal, border: "1px solid rgba(0,255,204,0.3)", padding: "6px 14px", fontSize: 12 },
  area: { position: "relative", width: 300, height: 400, borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(180deg, rgba(0,184,255,0.06), rgba(7,11,22,0) 70%)", overflow: "hidden", cursor: "crosshair" },
  overlay: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, zIndex: 30, background: "rgba(7,11,22,0.74)", backdropFilter: "blur(4px)" },
  doneText: { color: C.text, fontSize: 15, fontWeight: 800, margin: 0, textAlign: "center", padding: "0 14px" },
  hint: { color: C.muted, fontSize: 12 },
};
