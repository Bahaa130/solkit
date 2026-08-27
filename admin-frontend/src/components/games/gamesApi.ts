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
