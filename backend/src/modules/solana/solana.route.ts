// backend/src/modules/solana/solana.route.ts
// 🔀 بروكسي لطلبات Solana JSON-RPC: نمرّرها من السيرفر (حيث لا قيود CORS)
// إلى شبكة سولانا الفعلية، فتتجاوز الواجهة/الـWebView مشكلة "Failed to fetch".
import { Router, Request, Response } from "express";

const router = Router();

// عنوان RPC الحقيقي لسولانا (يمكن ضبطه عبر متغيّر البيئة على Render لنقطة مخصّصة)
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

router.post("/rpc", async (req: Request, res: Response) => {
  try {
    // 🔄 مهلة وإعادة محاولة قصيرة: عقد devnet العامة قد تتباطأ/تحدّ من المعدّل،
    // والبروكسي لا يجب أن يُعلّق فيه الطلب (على الهاتف يظهر "Failed to fetch").
    const body = JSON.stringify(req.body ?? {});
    let lastErr: unknown = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const upstream = await fetch(SOLANA_RPC, {
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

        if (upstream.ok) {
          const text = await upstream.text();
          res.status(upstream.status);
          const ct = upstream.headers.get("content-type");
          if (ct) res.setHeader("Content-Type", ct);
          res.send(text);
          return;
        }
        // 429/5xx عابرة → نعيد المحاولة التالية
        lastErr = new Error(`upstream_http_${upstream.status}`);
      } catch (e) {
        lastErr = e;
        if (attempt >= 3) throw e;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    throw lastErr ?? new Error("upstream_failed");
  } catch (err) {
    console.error("Solana RPC proxy error:", err);
    res.status(504).json({ jsonrpc: "2.0", error: { code: -32603, message: "solana_rpc_proxy_failed" }, id: null });
  }
});

export default router;
