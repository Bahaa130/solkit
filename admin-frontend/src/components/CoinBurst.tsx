// src/components/CoinBurst.tsx
// 🪙 مؤثر تطاير العملة عند ترقية كارت: عملات (برمز العملة الذي رفعه المدير) تتناثر
// من منتصف الكارت نحو الأعلى مع دوران وتلاشٍ — إيحاء تحفيزي جذّاب.

import React from "react";
import CoinIcon from "./CoinIcon";

export interface CoinBurstItem {
  id: number;
  x: number; // منتصف الكارت على الشاشة (px)
  y: number; // أعلى الكارت على الشاشة (px)
}

interface Props {
  bursts: CoinBurstItem[];
}

const PARTICLES = 12;

const Particle = ({ size }: { size: number }) => {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const dx = dir * (24 + Math.random() * 46);
  const dy = -1 * (60 + Math.random() * 140);
  const rot = `${(Math.random() * 2 - 1) * 400}deg`;
  const delay = Math.random() * 0.12;
  return (
    <div
      className="coin-particle"
      style={{
        left: 0,
        top: 0,
        animationDelay: `${delay}s`,
        ["--dx" as any]: `${dx}px`,
        ["--dy" as any]: `${dy}px`,
        ["--rot" as any]: rot,
      }}
    >
      <CoinIcon size={size} />
    </div>
  );
};

export default function CoinBurst({ bursts }: Props) {
  if (!bursts.length) return null;
  return (
    <div className="coin-burst-layer" aria-hidden>
      {bursts.map((b) => (
        <React.Fragment key={b.id}>
          {Array.from({ length: PARTICLES }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: b.x, top: b.y, zIndex: 2 }}>
              <Particle size={i % 4 === 0 ? 34 : 22} />
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}