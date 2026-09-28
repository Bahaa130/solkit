// src/lib/solanaFees.ts
// 💸 حساب رسوم الشبكة وفحص الرصيد قبل فتح المحفظة — يمنع رسالة "Insufficient SOL"
// الغامضة من Phantom التي تظهر عندما يكون رصيد المحفظة مساوياً تماماً للسعر المعروض
// (المعاملة تحتاج = المبلغ + رسوم الشبكة 5000 lamports لكل توقيع).
// كما يكتشف اختلاف شبكة المحفظة عن شبكة الموقع عبر اسم كتلة الـ RPC المستعملة.

import { Connection, PublicKey } from "@solana/web3.js";

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** الرسوم الأساسية لـ Solana = 5000 lamports لكل توقيع (0.000005 SOL) */
export const BASE_FEE_LAMPORTS = 5_000;

/**
 * هامش أمان فوق الرسوم الأساسية: يغطي أي رسوم أولوية يضيفها المحفظة من طرفها
 * ويمنع رفض Phantom للمعاملة بحساب دقيق. قيمته 0.00002 SOL — لا تذكر أمام المستخدم.
 */
export const FEE_SAFETY_BUFFER_LAMPORTS = 20_000;

/** إجمالي ما يجب أن يتوفر في محفظة الدافع = مبالغ التحويلات + رسوم الشبكة */
export function totalWithFee(transferLamports: number): number {
  return Math.max(0, Math.round(transferLamports)) + FEE_SAFETY_BUFFER_LAMPORTS;
}

export function formatSol(lamports: number, decimals = 6): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol.toFixed(decimals);
}

/** تسميات الكتل المعروفة — kusلمة genesis drive لكل شبكة */
const GENESIS_LABELS: Record<string, string> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "mainnet-beta",
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1: "devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": "testnet",
};

const clusterCache = new Map<string, string>();

/**
 * 🔎 اسم الكتلة الحقيقية التي يردّ بها الـ RPC الذي يستخدمه الموقع.
 * الغرض: كشف حالة خطأ شائعة جداً — محفظة Phantom على شبكة بينما الموقع على أخرى،
 * فيظهر للمستخدم «رصيد غير كافٍ» رغم أنه يملك رصيداً على الشبكة التي يراها.
 */
export async function getClusterLabel(connection: Connection): Promise<string> {
  const key = connection.rpcEndpoint || "default";
  const cached = clusterCache.get(key);
  if (cached) return cached;
  let label = "غير معروفة";
  try {
    const genesis = await connection.getGenesisHash();
    label = GENESIS_LABELS[genesis] || `مخصصة (${genesis.slice(0, 6)}…)`;
  } catch {
    /* بعض البروكxies المقيّدة لا تدعم getGenesisHash — نُبقي "غير معروفة" */
  }
  clusterCache.set(key, label);
  return label;
}

export interface BalanceCheck {
  ok: boolean;
  balance: number;
  required: number;
  shortfall: number;
  cluster: string;
}

/**
 * 💰 فحص الرصيد قبل التوقيع: يقرأ رصيد الدافع من نفس شبكة الـ RPC التي جُلب
 * منها الـ blockhash، ويقارنه بإجمالي (المبلغ + رسوم الشبكة).
 * يُرجع shortfall = قيمة النقص بالـ lamports (0 إذا كان الرصيد كافياً).
 */
export async function inspectSolBalance(
  connection: Connection,
  owner: PublicKey,
  transferLamports: number,
): Promise<BalanceCheck> {
  const required = totalWithFee(transferLamports);
  const [balance, cluster] = await Promise.all([
    connection.getBalance(owner, "confirmed").catch(() => 0),
    getClusterLabel(connection),
  ]);
  return {
    ok: balance >= required,
    balance,
    required,
    shortfall: Math.max(0, required - balance),
    cluster,
  };
}

/**
 * ✍️ رسالة عربية دقيقة تشرح الفارق بين السعر المعروض وما تطلبه المحفظة فعلياً.
 * - shortfall > 0  → الرصيد لا يكفي على شبكة الموقع.
 * - shortfall === 0 → رصيدنا كافٍ، فالمشكلة غالباً شبكة المحفظة مختلفة عن شبكة الموقع.
 */
export function insufficientSolMessage(
  check: BalanceCheck,
  networkLabel: string,
): string {
  const { balance, required, shortfall, cluster } = check;
  if (shortfall > 0) {
    return (
      `رصيد محفظتك على شبكة ${cluster}: ${formatSol(balance)} SOL — ` +
      `والمطلوب ${formatSol(required)} SOL ` +
      `(شامل ${formatSol(FEE_SAFETY_BUFFER_LAMPORTS, 5)} SOL رسوم شبكة). ` +
      `ينقصك ${formatSol(shortfall)} SOL.`
    );
  }
  return (
    `رصيدك على شبكة ${cluster} كافٍ (${formatSol(balance)} SOL ≥ ${formatSol(required)} SOL)، ` +
    `فالمشكلة أن محفظة Phantom على شبكة مختلفة عن شبكة الموقع (${networkLabel}). ` +
    `بدّل شبكة المحفظة إلى ${cluster} ثم أعد المحاولة.`
  );
}
