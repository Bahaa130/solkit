// src/components/games/CoinLayer.tsx
// 🪙 طبقة "+X SOLKIT" العائمة — تعرض مكاسب فورية تتصاعد وتتلاشى فوق منطقة اللعب
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useBranding } from "../../branding";

export interface CoinLayerHandle {
  /** يعرض نافذة "+amount SOLKIT" عائمة (أو نص مخصص) عند إحداثيات نسبة مئوية داخل الطبقة */
  pop: (amount: number, x?: number, y?: number, text?: string) => void;
}

interface PopItem {
  id: number;
  amount: number;
  x: number;
  y: number;
  text?: string;
}

interface CoinLayerProps {
  /** لون النوافذ (افتراضي: تيل) */
  color?: string;
}

export const CoinLayer = forwardRef<CoinLayerHandle, CoinLayerProps>(({ color = "#00ffcc" }, ref) => {
  const [pops, setPops] = useState<PopItem[]>([]);
  const idRef = useRef(0);
  const { branding } = useBranding();

  useImperativeHandle(ref, () => ({
    pop: (amount, x = 50, y = 40, text) => {
      const id = ++idRef.current;
      setPops((prev) => [...prev.slice(-14), { id, amount, x, y, text }]); // حماية من تراكم غير منتهٍ
      setTimeout(() => setPops((prev) => prev.filter((p) => p.id !== id)), 1300);
    },
  }));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 20 }}>
      {pops.map((p) => (
        <span
          key={p.id}
          className="coin-pop"
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            color: p.text ? "#ff5c7a" : color,
            fontSize: p.text ? 14 : 15,
            fontWeight: 900,
            fontFamily: "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif",
            whiteSpace: "nowrap",
            textShadow: `0 0 14px ${p.text ? "#ff5c7a" : color}`,
          }}
        >
          {p.text || `+${Number(p.amount).toFixed(2)} ${branding.tokenSymbol}`}
        </span>
      ))}
    </div>
  );
});
CoinLayer.displayName = "CoinLayer";
