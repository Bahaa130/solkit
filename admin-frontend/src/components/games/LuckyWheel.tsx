// src/components/games/LuckyWheel.tsx
// 🎰 عجلة الحظ — النتيجة يحددها السيرفر حصرياً، والعميل يحرّك العجلة نحوها
// إعادة تصميم: حلقة مضيئة + أضواء حافة + شرائح بشارات قيّمة + مؤشر ذهبي + توهج الفوز
import React, { useEffect, useRef, useState } from "react";
import { C, font } from "../../theme";
import { useLang } from "../../i18n/index.tsx";
import { useBranding } from "../../branding";
import { spinWheel, submitResult, fetchWheelSegments } from "./gamesApi";
import { formatCooldown } from "./gamesUtils";
import { CoinLayer } from "./CoinLayer";
import type { CoinLayerHandle } from "./CoinLayer";
import { useToast } from "../Toast";

export interface GameProps {
  userId: number;
  token: string;
  multiplier: number;
  cooldown: number; // ثوانٍ متبقية من حالة السيرفر
  onReward: (reward: number, x?: number, y?: number) => void;
  onStatusRefresh?: () => void;
}

const WHEEL_SIZE = 250;
const CENTER = WHEEL_SIZE / 2;
const CHIP_R = 79; // نصف قطر مركز شارات القيمة

// 🎨 ألوان دورة للشرائح تُعيّن تلقائياً حسب العدد
const SEG_COLORS = ["#22e584", "#00b8ff", "#7c5cff", "#ffb020", "#00ffcc", "#ff5c7a", "#ff8a00", "#ffd700", "#ff4d4d", "#8b5cf6", "#22d3ee", "#f472b6"];

// 🏷️ شريحة واحدة (القيمة واللون والنص والشارة — الجائزة الكبرى = أعلى قيمة)
interface WheelSegment { label: string; color: string; text: string; chip: string; jackpot?: boolean }
const buildSegments = (values: number[]): WheelSegment[] => {
  const max = Math.max(...values);
  return values.map((v, i) => {
    const color = SEG_COLORS[i % SEG_COLORS.length];
    const jackpot = v >= max;
    return {
      label: jackpot ? "💎" : String(v),
      color: jackpot ? "#ffd700" : color,
      text: jackpot ? "#3a2b00" : (["#7c5cff", "#ff5c7a", "#8b5cf6", "#f472b6"].includes(color) ? "#ffffff" : "#04241a"),
      chip: "rgba(255,255,255,0.85)",
      jackpot,
    };
  });
};

// 🔦 أضواء الحافة (16 ضوءاً ذهبياً/تيل حول الحلقة المزخرفة)
const PEGS = Array.from({ length: 16 });
const PEG_R = 140; // نصف قطر دائرة الأضواء حول مركز منطقة اللعب (150)

export default function LuckyWheel({ token, multiplier, cooldown, onReward, onStatusRefresh }: GameProps) {
  const { dir, t } = useLang();
  const { branding } = useBranding();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [remain, setRemain] = useState(cooldown);
  const [lastSegment, setLastSegment] = useState<number | null>(null);
  // 🎰 شرائح العجلة الديناميكية (تُقرأ من إعدادات المدير) + أكبر قيمة (الجائزة الكبرى)
  const [segments, setSegments] = useState<WheelSegment[]>(() => buildSegments([1.0, 2.5, 1.5, 3.0, 0.5, 2.0, 12.0, 1.5]));
  const [maxValue, setMaxValue] = useState(12);
  const coinRef = useRef<CoinLayerHandle>(null);  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  // عدّاد تنازلي محلي للكولدون
  useEffect(() => {
    setRemain(cooldown);
    if (cooldown <= 0) return;
    const iv = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(iv);
  }, [cooldown]);

  // تنظيف مؤقت التسوية عند إزالة المكوّن منتصف الدوران
  useEffect(() => {
    return () => { if (settleTimer.current) clearTimeout(settleTimer.current); };
  }, []);

  // 🎰 جلب شرائح العجلة الديناميكية من إعدادات المدير
  useEffect(() => {
    let active = true;
    fetchWheelSegments().then((cfgs) => {
      const values = cfgs.map((c) => c.value);
      if (active && values.length) { setSegments(buildSegments(values)); setMaxValue(Math.max(...values)); }
    });
    return () => { active = false; };
  }, []);

  const SEG_DEG = 360 / segments.length;

  const angleFor = (segment: number) => {
    const base = (360 - (segment * SEG_DEG + SEG_DEG / 2)) % 360; // مركز الشريحة عند المؤشر العلوي
    const currentMod = rotation % 360;
    let delta = base - currentMod;
    if (delta < 0) delta += 360;
    return rotation + delta + 360 * 5; // 5 دورات كاملة + الهبوط
  };

  const handleSpin = async () => {
    if (spinning) return;
    try {
      setSpinning(true);
      setReward(null);
      setLastSegment(null);
      const { segment, spinToken } = await spinWheel(token);
      const target = angleFor(segment);
      setRotation(target);

      // عند انتهاء الحركة الحركية → تسوية النتيجة مع السيرفر
      settleTimer.current = setTimeout(async () => {
        try {
          const res = await submitResult(token, { game: "wheel", segment, spinToken });
          setReward(res.reward);
          setLastSegment(segment);
          if (res.reward > 0) {
            coinRef.current?.pop(res.reward, 50, 30);
            onReward(res.reward, 50, 32);
          }
          const jackpotThreshold = maxValue * multiplier;
          if (res.reward > 0 && res.reward >= jackpotThreshold) toast.success(t("wheel.jackpot", { amount: res.reward.toFixed(2), token: branding.tokenSymbol }));
          else if (res.reward > 0) toast.success(t("wheel.won", { amount: res.reward.toFixed(2), token: branding.tokenSymbol }));
          if (res.leveledUp) toast.success(t("game.levelUp", { level: res.gameLevel, m: res.multiplier.toFixed(2) }));
          onStatusRefresh?.();
        } catch (e: any) {
          toast.error(e.message || t("wheel.settleError"));
          onStatusRefresh?.();
        } finally {
          setSpinning(false);
        }
      }, 3800);
    } catch (e: any) {
      toast.error(e.message || t("wheel.error"));
      setSpinning(false);
    }
  };

  const disabled = spinning || remain > 0;
  const jackpot = reward !== null && reward >= maxValue * multiplier;

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div className="wheel-area" style={styles.area}>
        <CoinLayer ref={coinRef} />

        {/* 🔦 أضواء الحافة المتناوبة */}
        {PEGS.map((_, i) => {
          const rad = ((i * 360) / PEGS.length * Math.PI) / 180;
          const x = 150 + PEG_R * Math.sin(rad);
          const y = 150 - PEG_R * Math.cos(rad);
          const gold = i % 2 === 0;
          const color = gold ? "#ffd700" : "#00ffcc";
          return (
            <span
              key={i}
              className="peg-blink"
              style={{ position: "absolute", left: x, top: y, width: 8, height: 8, borderRadius: "50%", background: color, color, transform: "translate(-50%,-50%)", animationDelay: `${(i % 4) * 0.35}s`, zIndex: 5, pointerEvents: "none" }}
            />
          );
        })}

        {/* حلقة مزخرفة تدور ببطء */}
        <div className="rim-spin" style={styles.rim} />

        {/* 🎡 الدولاب نفسه */}
        <div
          className={jackpot ? "wheel-win" : ""}
          style={{
            width: WHEEL_SIZE,
            height: WHEEL_SIZE,
            borderRadius: "50%",
            background: `conic-gradient(${segments.map((s, i) => `${s.color} ${i * SEG_DEG}deg ${(i + 1) * SEG_DEG}deg`).join(", ")})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 3.6s cubic-bezier(.15,.85,.25,1)" : "none",
            boxShadow: "0 0 46px rgba(0,255,204,0.22), inset 0 0 0 6px rgba(7,11,22,0.75)",
            position: "relative",
            zIndex: 12,
          }}
        >
          {/* لمعان زجاجي علوي */}
          <div style={styles.gloss} />

          {/* شارات القيمة (تدور مع العجلة) */}
          {segments.map((seg, i) => {
            const rad = ((i * SEG_DEG + SEG_DEG / 2) * Math.PI) / 180;
            const x = CENTER + CHIP_R * Math.sin(rad);
            const y = CENTER - CHIP_R * Math.cos(rad);
            const isWinner = lastSegment === i;
            return (
              <div
                key={i}
                className={seg.jackpot ? "jackpot-pulse" : ""}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  transform: "translate(-50%,-50%)",
                  padding: seg.jackpot ? "8px 13px" : "5px 11px",
                  borderRadius: 999,
                  background: seg.jackpot ? "linear-gradient(135deg,#fff3b0,#ffd700 55%,#e6b400)" : seg.chip,
                  color: seg.text,
                  border: isWinner ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.45)",
                  boxShadow: isWinner ? "0 0 18px rgba(255,255,255,0.9)" : "0 2px 8px rgba(0,0,0,0.35)",
                  fontSize: seg.jackpot ? 13 : 12,
                  fontWeight: 900,
                  zIndex: 8,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {seg.label}
              </div>
            );
          })}
        </div>

        {/* 🎯 المؤشر الذهبي */}
        <div style={styles.pointerWrap}>
          <div style={styles.pointerBall} />
          <div style={styles.pointerTip} />
        </div>

        {/* ⏺ مركز الدولاب + زر الدوران (ثابت لا يدور) */}
        <div style={styles.hub}>
          <div style={styles.hubRing} />
          <button onClick={handleSpin} disabled={disabled} className={disabled ? "btn btn-ghost" : "btn btn-primary"} style={styles.spinBtn}>
            {spinning ? t("wheel.spinning") : remain > 0 ? t("wheel.wait", { time: formatCooldown(remain, t) }) : t("wheel.spin")}
          </button>
        </div>
      </div>

      <p style={styles.hint}>{t("wheel.hint", { m: multiplier.toFixed(2) })}</p>
      {reward !== null && !spinning && (
        <div className="glass" style={styles.rewardBox}>
          <span className="coin-bounce" style={{ fontSize: 20 }}>🪙</span>
          <span className="gradient-text" style={{ fontSize: 18, fontWeight: 900 }}>
            +{reward.toFixed(2)} {branding.tokenSymbol}
          </span>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "6px 0 16px", fontFamily: font, direction: "rtl" },
  area: { position: "relative", width: 300, height: 300, display: "flex", alignItems: "center", justifyContent: "center" },
  // 🔦 الحلقة المزخرفة
  rim: {
    position: "absolute",
    width: 262,
    height: 262,
    borderRadius: "50%",
    border: "2px dashed rgba(255,255,255,0.16)",
    boxShadow: "inset 0 0 22px rgba(0,255,204,0.08)",
    zIndex: 2,
    pointerEvents: "none",
  },
  // لمعان زجاجي على الدولاب
  gloss: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    pointerEvents: "none",
    background: "radial-gradient(circle at 33% 24%, rgba(255,255,255,0.28), rgba(255,255,255,0.06) 34%, rgba(0,0,0,0.14) 68%, transparent 74%)",
    zIndex: 6,
  },
  // 🎯 المؤشر
  pointerWrap: { position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 40, pointerEvents: "none" },
  pointerBall: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%, #ffffff, #ffd700 55%, #b8860b)",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 0 14px rgba(255,215,0,0.8)",
  },
  pointerTip: {
    width: 0,
    height: 0,
    borderLeft: "13px solid transparent",
    borderRight: "13px solid transparent",
    borderTop: "28px solid #ffd700",
    marginTop: -3,
    filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.55))",
  },
  // ⏺ المركز
  hub: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 35, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  hubRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: "radial-gradient(circle at 30% 25%, rgba(0,255,204,0.22), rgba(7,11,22,0.88) 65%)",
    border: "2px solid rgba(0,255,204,0.5)",
    boxShadow: "0 0 28px rgba(0,255,204,0.3), inset 0 0 18px rgba(0,255,204,0.12)",
  },
  spinBtn: { padding: "13px 20px", fontSize: 13, minWidth: 112, pointerEvents: "auto", position: "relative" },
  hint: { color: C.muted, fontSize: 12, marginTop: 4 },
  rewardBox: { display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 999 },
};
