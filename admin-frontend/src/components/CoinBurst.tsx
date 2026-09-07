// src/components/CoinBurst.tsx
// 🪙 مؤثر تطاير العملة ثلاثي الأبعاد عند ترقية كارت:
// عملات معدنية بوجهين تدور حول محور Y (إحساس معدن حقيقي) وتنطلق في مسارات قوسية
// بجاذبية من مركز الكارت، مع حلقة انفجار متوهجة، شرارات نجمية، ونص عائم بمقدار الزيادة.

import React from "react";
import CoinIcon from "./CoinIcon";

export interface CoinBurstItem {
  id: number;
  x: number; // منتصف الكارت على الشاشة (px)
  y: number; // أعلى الكارت على الشاشة (px)
  label?: string; // نص الزيادة العائم، مثل "+0.04"
}

interface Props {
  bursts: CoinBurstItem[];
}

const COINS = 14;
const SPARKS = 10;
const SPARK_GLYPHS = ["✦", "✧", "✺", "✶"];
const SPARK_COLORS = ["#00ffcc", "#ffd166", "#7c9aff", "#ff6ec7"];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** عملة 3D: وجهان (أمامي/خلفي) يدوران حول المحور Y + ظل معدني خلفي للسماكة */
const Coin3D = ({ size }: { size: number }) => (
  <div
    style={{ position: "relative", width: size, height: size, ["--spinTime" as any]: `${rand(0.55, 0.95)}s` }}
    className="coin-spin"
  >
    <div className="coin-face" style={{ position: "absolute", inset: 0 }}>
      <CoinIcon size={size} />
      <div className="coin-depth" />
    </div>
    <div className="coin-face coin-back">
      <CoinIcon size={size} />
      <div className="coin-depth" />
    </div>
  </div>
);

/** عملة واحدة بمسار عشوائي: صعود حتى قمة ثم هبوط لطيف، مع دوران ثلاثي الأبعاد */
const Coin = ({ i }: { i: number }) => {
  const style: React.CSSProperties = {
    ["--dx" as any]: `${rand(-46, 46)}px`,
    ["--up" as any]: `-${rand(90, 190)}px`,
    ["--down" as any]: `${rand(18, 78)}px`,
    ["--sk" as any]: `${rand(0.85, 1.35)}`,
    animationDelay: `${rand(0, 0.16)}s`,
  };
  // كل رابع عملة أكبر بشكل ملحوظ (بطل اللقطة)
  const size = i % 5 === 0 ? 40 : i % 3 === 0 ? 30 : 22;
  return (
    <div className="coin-orbit" style={style}>
      <Coin3D size={size} />
    </div>
  );
};

const Spark = ({ i }: { i: number }) => {
  const style: React.CSSProperties = {
    ["--sdx" as any]: `${rand(-95, 95)}px`,
    ["--sdy" as any]: `${rand(-150, -20)}px`,
    ["--srot" as any]: `${rand(-200, 200)}deg`,
    color: SPARK_COLORS[i % SPARK_COLORS.length],
    fontSize: rand(11, 19),
    animationDelay: `${rand(0, 0.12)}s`,
  };
  return <div className="burst-spark" style={style}>{SPARK_GLYPHS[i % SPARK_GLYPHS.length]}</div>;
};

export default function CoinBurst({ bursts }: Props) {
  if (!bursts.length) return null;
  return (
    <div className="coin-burst-layer" aria-hidden>
      {bursts.map((b) => (
        <React.Fragment key={b.id}>
          {/* حلقة الانفجار */}
          <div className="burst-flash" style={{ left: b.x, top: b.y, width: 120, height: 120 }} />
          {/* نص الزيادة */}
          {b.label ? (
            <div className="burst-label" style={{ left: b.x, top: b.y - 14, fontSize: 21 }}>{b.label}</div>
          ) : null}
          {/* العملات والشرارات من نفس نقطة الانطلاق */}
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            {Array.from({ length: COINS }, (_, i) => <Coin key={i} i={i} />)}
            {Array.from({ length: SPARKS }, (_, i) => <Spark key={i} i={i} />)}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/** 🔊 صوت عملة قصير (WebAudio، بدون ملفات) — ينجح لأنه من داخل نقرة مستخدم */
export function playCoinSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [[987.77, 0], [1318.51, 0.07]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, t + offset);
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, t + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.25);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch { /* تجاهل */ }
}