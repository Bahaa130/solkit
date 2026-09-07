import { useEffect, useState } from "react";
import { playCoinSound } from "../components/CoinBurst";
import type { CoinBurstItem } from "../components/CoinBurst";

export function useCoinBurst() {
  const [bursts, setBursts] = useState<CoinBurstItem[]>([]);

  const trigger = (rect: DOMRect | null, label?: string) => {
    if (!rect) return;
    const id = Date.now() + Math.random();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    setBursts((p) => [...p, { id, x, y, label }]);
    playCoinSound().catch(() => {});
  };

  useEffect(() => {
    if (!bursts.length) return;
    const t = setTimeout(() => {
      setBursts((p) => p.slice(1));
    }, 1800);
    return () => clearTimeout(t);
  }, [bursts]);

  return { bursts, trigger, setBursts };
}
