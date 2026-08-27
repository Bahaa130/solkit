// src/components/games/XO.tsx
// ❌⭕ لعبة XO (تيك تاك تو) ضد الذكاء الاصطناعي — الفوز يمنح الرصيد
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, font } from "../../theme";
import { useLang } from "../../i18n/index.tsx";
import { submitResult } from "./gamesApi";
import { formatCooldown } from "./gamesUtils";
import { useToast } from "../Toast";

interface XOProps {
  token: string;
  multiplier: number;
  cooldown: number;
  onReward: (reward: number, x?: number, y?: number) => void;
  onStatusRefresh?: () => void;
}

type Mark = "" | "X" | "O";
type Result = "win" | "lose" | "draw" | null;

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const checkWinner = (b: Mark[]): Mark => {
  for (const [a, c, d] of WINS) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return "";
};

const aiMove = (b: Mark[]): number => {
  // 1) فوز محتمل للذكاء
  for (let i = 0; i < 9; i++) {
    if (!b[i]) { const t = [...b]; t[i] = "O"; if (checkWinner(t) === "O") return i; }
  }
  // 2) منع فوز اللاعب
  for (let i = 0; i < 9; i++) {
    if (!b[i]) { const t = [...b]; t[i] = "X"; if (checkWinner(t) === "X") return i; }
  }
  // 3) المركز
  if (!b[4]) return 4;
  // 4) الزوايا
  const corners = [0, 2, 6, 8].filter((i) => !b[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  // 5) أي مكان
  const rest = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return rest[Math.floor(Math.random() * rest.length)];
};

export default function XO({ token, multiplier, cooldown, onReward, onStatusRefresh }: XOProps) {
  const { dir, t } = useLang();
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(""));
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [result, setResult] = useState<Result>(null);
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [remain, setRemain] = useState(cooldown);
  const [thinking, setThinking] = useState(false);
  const toast = useToast();
  const boardRef = useRef<Mark[]>(Array(9).fill(""));
  const busyRef = useRef(false);

  useEffect(() => {
    setRemain(cooldown);
    if (cooldown <= 0) return;
    const iv = setInterval(() => setRemain((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(iv);
  }, [cooldown]);

  const finish = useCallback(async (r: Result) => {
    setResult(r);
    setPhase("done");
    busyRef.current = false;
    if (r !== "win") { onStatusRefresh?.(); return; }
    try {
      const res = await submitResult(token, { game: "xo", score: 1 });
      setLastReward(res.reward);
      if (res.reward > 0) onReward(res.reward);
      if (res.leveledUp) toast.success(t("game.levelUp", { level: res.gameLevel, m: res.multiplier.toFixed(2) }));
      onStatusRefresh?.();
    } catch (e: any) {
      toast.error(e.message || t("xo.error"));
      onStatusRefresh?.();
    }
  }, [token, onReward, onStatusRefresh, toast, t]);

  const applyMove = useCallback((next: Mark[], moveBy: "X" | "O") => {
    setBoard(next);
    boardRef.current = next;
    const w = checkWinner(next);
    if (w === "X") { finish("win"); return; }
    if (w === "O") { finish("lose"); return; }
    if (next.every((c) => c)) { finish("draw"); return; }
    // ليس هناك فائز بعد → دور الذكاء إن كان دور اللاعب قد انتهى
    if (moveBy === "X") {
      setThinking(true);
      setTimeout(() => {
        const b = boardRef.current;
        if (b.some((c) => !c) === false) { setThinking(false); return; }
        const idx = aiMove(b);
        const after = [...b]; after[idx] = "O";
        setThinking(false);
        applyMove(after, "O");
      }, 420);
    }
  }, [finish]);

  const startGame = () => {
    const fresh = Array(9).fill("") as Mark[];
    setBoard(fresh);
    boardRef.current = fresh;
    setResult(null);
    setLastReward(null);
    busyRef.current = false;
    setPhase("playing");
  };

  const handleCell = (i: number) => {
    if (phase !== "playing" || thinking || busyRef.current) return;
    if (boardRef.current[i]) return;
    const next = [...boardRef.current];
    next[i] = "X";
    applyMove(next, "X");
  };

  const usable = phase !== "playing" && remain <= 0;

  const statusText = () => {
    if (phase === "playing") return thinking ? t("xo.aiTurn") : t("xo.yourTurn");
    if (phase === "done") {
      if (result === "win") return t("xo.youWin", { r: (lastReward || 0).toFixed(2) });
      if (result === "lose") return t("xo.aiWin");
      return t("xo.draw");
    }
    return t("xo.readyPrompt");
  };

  return (
    <div style={{ ...styles.wrap, direction: dir }}>
      <div style={styles.topBar}>
        <span className="pill" style={styles.statusPill}>{statusText()}</span>
      </div>

      <div style={styles.board}>
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleCell(i)}
            disabled={phase !== "playing" || thinking || !!cell}
            style={{
              ...styles.cell,
              color: cell === "X" ? C.teal : cell === "O" ? "#ff8a00" : C.text,
              border: cell ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {cell}
          </button>
        ))}
      </div>

      {phase !== "playing" && (
        <button onClick={startGame} disabled={!usable} className={usable ? "btn btn-amber" : "btn btn-ghost"} style={{ padding: "12px 28px", fontSize: 14 }}>
          {remain > 0 ? t("xo.wait", { time: formatCooldown(remain, t) }) : phase === "done" ? t("xo.playAgain") : t("xo.start")}
        </button>
      )}

      <p style={styles.hint}>{t("xo.hint", { m: multiplier.toFixed(2), v: (5 * multiplier).toFixed(3) })}</p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "6px 0 14px", fontFamily: font, direction: "rtl" },
  topBar: { display: "flex", gap: 10 },
  statusPill: { background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.3)", padding: "6px 16px", fontSize: 12, fontWeight: 700 },
  board: { display: "grid", gridTemplateColumns: "repeat(3, 84px)", gridTemplateRows: "repeat(3, 84px)", gap: 8 },
  cell: { borderRadius: 16, fontSize: 40, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", cursor: "pointer", outline: "none", transition: "all .12s ease" },
  hint: { color: C.muted, fontSize: 12 },
};
