// src/lib/blockhash.ts
// 🔁 جلب آخر blockhash مع إعادة محاولة تلقائية لتجاوز أوقات الازدحام/بطء الشبكة.
// المسار الأول عبر web3.js Connection، والثاني عبر fetch مباشر (نفس آلية apiFetch
// التي تعمل لتسجيل الدخول داخل تطبيق الموبايل) — فيرمي خطأً يحوي تفاصيل آخر فشل.
// مشتركة بين دفع رسوم التسجيل/التفعيل (App.tsx) والمشاركة في الاكتتاب (IcoPage.tsx)
// كي يسلك كلا المسارين نفس السلوك المجرَّب والسليم تماماً.

import { Connection } from "@solana/web3.js";

export async function fetchBlockhashWithRetry(
  connection: Connection,
  report: (label: string, err: unknown) => void,
  rpcUrl: string,
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let lastErr: unknown = null;

  // 1️⃣ عبر web3.js Connection
  for (let i = 0; i < 3; i++) {
    try {
      const info = await connection.getLatestBlockhash("confirmed");
      return { blockhash: info.blockhash, lastValidBlockHeight: info.lastValidBlockHeight };
    } catch (e) {
      lastErr = e;
      report(`web3 (${i + 1}/3)`, e);
      await sleep(1000 * (i + 1));
    }
  }

  // 2️⃣ عبر fetch مباشر (يُرسل نفس طلب JSON-RPC للبروكسي)
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getLatestBlockhash",
          params: [{ commitment: "confirmed" }],
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data?.result?.value?.blockhash) {
          return {
            blockhash: data.result.value.blockhash,
            lastValidBlockHeight: data.result.value.lastValidBlockHeight,
          };
        }
        lastErr = new Error(`http ${res.status}`);
      } else {
        lastErr = new Error(`http ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
      report(`direct (${i + 1}/3)`, e);
    }
    await sleep(1000 * (i + 1));
  }

  const detail = lastErr instanceof Error ? lastErr.message : "network";
  throw new Error(`RPC unreachable :: ${detail}`);
}
