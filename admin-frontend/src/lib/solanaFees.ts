// src/lib/solanaFees.ts
// 💸 حساب رسوم الشبكة وفحص الرصيد قبل فتح المحفظة.
//
// لماذا؟ Phantom في المتصفح يقدّر الرصيد على **شبكة محفظته**، فإن كانت مختلفة عن
// شبكة الموقع (شائع جداً: Phantom على mainnet والموقع على devnet) تظهر رسالة
// «Insufficient SOL» رغم توفّر رصيد. هنا نقرأ الرصيد من **نفس الـ RPC الذي جُلب منه
// الـ blockhash** ونعرض الأرقام الدقيقة، ونميّز بين نقص الرصيد الحقيقي واختلاف
// شبكة المحفظة عن شبكة الموقع.
//
// ⚠️ مبدأ أساسي: هذا الفحص **تنبيه لا حظر**. لا نمنع الدفع أبداً لأن قراءة
// الرصيد أخفقت أو لأن شبكتنا تخالف شبكة المحفظة — المستخدم يختار المتابعة.

import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** الرسوم الأساسية لـ Solana = 5000 lamports لكل توقيع (0.000005 SOL) */
export const BASE_FEE_LAMPORTS = 5_000;

/**
 * هامش أمان يُستخدم فقط إذا تعذّر على العقدة تقدير الرسوم الفعلية
 * (رسوم أولوية يضيفها المحفظة من طرفها). قيمته 0.00002 SOL.
 */
export const FEE_FALLBACK_LAMPORTS = 20_000;

export function formatSol(lamports: number, decimals = 6): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(decimals);
}

/**
 * 📐 الرسوم الحقيقية للمعاملة من العقدة نفسها (رسوم أساسية + أي أولوية).
 * ترجع null إذا تعذّر التقدير، فيستخدمها المستدعي بـ FEE_FALLBACK_LAMPORTS.
 */
export async function estimateFeeLamports(
  connection: Connection,
  transaction: Transaction,
): Promise<number | null> {
  try {
    const message = transaction.compileMessage();
    const res = await connection.getFeeForMessage(message, "confirmed");
    if (res?.value != null && res.value >= 0) return Number(res.value);
  } catch {
    /* blockhash غير مضبوط أو عقدة لا تدعم — نستخدم الاحتياطي */
  }
  return null;
}

export function totalWithFee(transferLamports: number, feeLamports: number): number {
  return Math.max(0, Math.round(transferLamports)) + Math.max(0, Math.round(feeLamports));
}

/**
 * 🌐 اسم الكتلة الحقيقية التي يردّ بها الـ RPC الذي يستخدمه الموقع (بصمة genesis).
 * الغرض: كشف حالة «محفظة Phantom على شبكة والموقع على أخرى» بأدقّ شكل ممكن.
 */
const GENESIS_LABELS: Record<string, string> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d": "mainnet-beta (الشبكة الحقيقية)",
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG": "devnet (شبكة التطوير)",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY": "testnet",
};

const clusterCache = new Map<string, string>();

export async function getClusterLabel(connection: Connection): Promise<string> {
  const key = connection.rpcEndpoint || "default";
  const cached = clusterCache.get(key);
  if (cached) return cached;
  let label = "غير معروفة";
  try {
    const genesis = await connection.getGenesisHash();
    label = GENESIS_LABELS[genesis] || `شبكة مخصصة (${genesis.slice(0, 6)}…)`;
  } catch {
    /* عقدة مقيّدة لا تدعم getGenesisHash */
  }
  clusterCache.set(key, label);
  return label;
}

export interface BalanceCheck {
  /** الرصيد مقروء فعلاً من العقدة (false إذا أخفقت القراءة) */
  readable: boolean;
  /** هل الرصيد يغطي الإجمالي المطلوب */
  ok: boolean;
  balance: number;
  required: number;
  fee: number;
  shortfall: number;
  cluster: string;
}

/**
 * 💰 فحص الرصيد على شبكة الموقع: required = مبالغ التحويلات + رسوم الشبكة الفعلية.
 * يُرجع `readable: false` عند فشل القراءة — ولا يُعامَل ذلك أبداً كـ «رصيد صفر».
 */
export async function inspectSolBalance(
  connection: Connection,
  owner: PublicKey,
  transferLamports: number,
  feeLamports?: number | null,
): Promise<BalanceCheck> {
  const fee =
    feeLamports == null || !Number.isFinite(feeLamports) || feeLamports <= 0
      ? FEE_FALLBACK_LAMPORTS
      : feeLamports;
  const required = totalWithFee(transferLamports, fee);
  const [balanceRaw, cluster] = await Promise.all([
    connection.getBalance(owner, "confirmed").catch(() => null),
    getClusterLabel(connection),
  ]);

  if (balanceRaw == null) {
    return { readable: false, ok: true, balance: 0, required, fee, shortfall: 0, cluster };
  }
  return {
    readable: true,
    ok: balanceRaw >= required,
    balance: balanceRaw,
    required,
    fee,
    shortfall: Math.max(0, required - balanceRaw),
    cluster,
  };
}

/**
 * ✍️ رسالة عربية دقيقة: تشرح الفارق بين السعر المعروض وما تطلبه المحفظة فعلياً.
 * - shortfall > 0  → رصيدك على شبكة الموقع لا يغطي الإجمالي.
 * - shortfall === 0 → رصيدنا كافٍ، فالمشكلة شبكة المحفظة مختلفة عن شبكة الموقع.
 */
export function insufficientSolMessage(
  check: BalanceCheck,
  networkLabel: string,
): string {
  const { balance, required, fee, shortfall, cluster } = check;
  const feeText = `${formatSol(fee, 5)} SOL رسوم شبكة`;
  if (shortfall > 0) {
    return (
      `رصيد محفظتك على ${cluster}: ${formatSol(balance)} SOL — والمطلوب ${formatSol(required)} SOL ` +
      `(شامل ${feeText}). ينقصك ${formatSol(shortfall)} SOL.`
    );
  }
  return (
    `رصيدك على ${cluster} كافٍ (${formatSol(balance)} SOL)، لكن المحفظة قد تكون على شبكة أخرى ` +
    `(${networkLabel}). بدّل شبكة Phantom إلى ${cluster.includes("devnet") ? "Devnet" : "الشبكة الحقيقية"}، ` +
    `أو تابع رغم ذلك (رسوم الشبكة ${feeText}).`
  );
}
