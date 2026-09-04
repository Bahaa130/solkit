import { apiFetch } from "../../lib/api";
// backend/src/components/games/gamesApi.ts
// 🎮 عمليات جلب واجهة الألعاب — كلها تمر عبر الـ Vite proxy إلى /api/users/games/*

export interface GamesStatus {
  gameLevel: number;
  gameXp: number;
  xpForNext: number;
  multiplier: number;
  totalEarned: number;
  playsCount: number;
  balance: number;
  eligible: boolean;
  todayEarned: { wheel: number; xo: number; catch: number; total: number };
  dailyCaps: { wheel: number; xo: number; catch: number; total: number };
  cooldowns: { wheel: number; xo: number; catch: number };
}

export interface GameResultResponse {
  reward: number;
  balance: number;
  multiplier: number;
  xpGained: number;
  gameLevel: number;
  gameXp: number;
  xpForNext: number;
  leveledUp: boolean;
  todayEarned: number;
  capped: boolean;
}

type GameKey = "wheel" | "xo" | "catch";

const readJson = async (res: Response) => {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};

export const fetchGamesStatus = async (token: string): Promise<GamesStatus> => {
  const res = await apiFetch("/api/users/games/status", {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.message || "فشل جلب حالة الألعاب");
  return data;
};

export const spinWheel = async (token: string): Promise<{ segment: number; spinToken: string }> => {
  const res = await apiFetch("/api/users/games/wheel/spin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.message || "فشل تدوير العجلة");
  return data;
};

export interface WheelSegmentCfg { value: number; weight: number }

// 🎰 جلب شرائح العجلة الديناميكية من إعدادات المدير (مسار عام)
export const fetchWheelSegments = async (): Promise<WheelSegmentCfg[]> => {
  try {
    const res = await apiFetch("/api/users/settings");
    const data = await readJson(res);
    if (res.ok && data.wheel && Array.isArray(data.wheel.segments) && data.wheel.segments.length) {
      return data.wheel.segments.map((s: any) => ({ value: Number(s.value) || 0, weight: Math.max(0, Number(s.weight) || 0) }));
    }
  } catch { /* ignore */ }
  return [
    { value: 1.0, weight: 20 }, { value: 2.5, weight: 10 },
    { value: 1.5, weight: 18 }, { value: 3.0, weight: 8 },
    { value: 0.5, weight: 22 }, { value: 2.0, weight: 14 },
    { value: 12.0, weight: 3 }, { value: 1.5, weight: 5 },
  ];
};

export const submitResult = async (
  token: string,
  payload: { game: GameKey; score?: number; segment?: number; spinToken?: string }
): Promise<GameResultResponse> => {
  const res = await apiFetch("/api/users/games/result", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.message || "فشل تسوية الجولة");
  return data;
};
