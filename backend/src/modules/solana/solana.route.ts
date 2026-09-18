// backend/src/modules/solana/solana.route.ts
// 🔀 بروكسي لطلبات Solana JSON-RPC: نمرّرها من السيرفر (حيث لا قيود CORS)
// إلى شبكة سولانا الفعلية، فتتجاوز الواجهة/الـWebView مشكلة "Failed to fetch".
// 🛡️ يعمل على شبكة المدير المضبوطة (devnet/mainnet-beta) ويصمد أمام تباطؤ
// عقد سولانا العامة وإيقاظ Render النائم (إعادة محاولة على أخطاء RPC ذاتها).
import { Router, Request, Response } from "express";
import { getSettings } from "../../config/settings.js";

const router = Router();

// عنوان RPC يدوي (غالباً نقطة مخصّصة على Render) يتفوّق على الشبكة المضبوطة
const ENV_RPC = process.env.SOLANA_RPC_URL;

/** اختيار عنوان RPC: إعداد البيئة أولاً، وإلا الشبكة المضبوطة في إعدادات الموقع. */
function rpcTarget(): string {
  if (ENV_RPC) return ENV_RPC;
  const s = getSettings();
  return s?.solanaNetwork === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

/** هل استجابة RPC تحمل خطأ عقدة (على الرغم من HTTP 200) نعيد المحاولة عليه؟ */
function isRpcLevelError(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  const err = payload?.error;
  if (!err) return false;
  const code = Number(err?.code);
  // -32005: node is unhealthy / behind; -32603: upstream fail; 429: rate limited
  return (
    code === -32005 ||
    code === -32603 ||
    code === 429 ||
    /unhealthy|rate|limit|too many/i.test(String(err?.message || ""))
  );
}

router.post("/rpc", async (req: Request, res: Response) => {
  const body = JSON.stringify(req.body ?? {});
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const upstream = await fetch(rpcTarget(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "solkit-rpc-proxy",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await upstream.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      // نعيد المحاولة على فشل HTTP (429/5xx) وعلى أخطاء RPC التشغيلية ذاتها
      if (upstream.ok && !isRpcLevelError(payload)) {
        res.status(upstream.status);
        const ct = upstream.headers.get("content-type");
        if (ct) res.setHeader("Content-Type", ct);
        res.send(text);
        return;
      }
      lastErr = new Error(`upstream_http_${upstream.status}_rpc_${payload?.error?.code ?? "?"}`);
    } catch (e) {
      lastErr = e;
      if (attempt >= 5) break;
    }
    // مهلة وسطية قصيرة بين المحاولات (تسمح لإيقاظ الخادم واستقرار العقدة)
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.error("Solana RPC proxy exhausted:", lastErr);
  res.status(504).json({ jsonrpc: "2.0", error: { code: -32603, message: "solana_rpc_proxy_failed" }, id: null });
});

export default router;