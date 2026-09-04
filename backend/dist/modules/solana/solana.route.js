// backend/src/modules/solana/solana.route.ts
// 🔀 بروكسي لطلبات Solana JSON-RPC: نمرّرها من السيرفر (حيث لا قيود CORS)
// إلى شبكة سولانا الفعلية، فتتجاوز الواجهة/الـWebView مشكلة "Failed to fetch".
import { Router } from "express";
const router = Router();
// عنوان RPC الحقيقي لسولانا (يمكن ضبطه عبر متغيّر البيئة على Render لنقطة مخصّصة)
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
router.post("/rpc", async (req, res) => {
    try {
        const upstream = await fetch(SOLANA_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body ?? {}),
        });
        const text = await upstream.text();
        res.status(upstream.status);
        const ct = upstream.headers.get("content-type");
        if (ct)
            res.setHeader("Content-Type", ct);
        res.send(text);
    }
    catch (err) {
        console.error("Solana RPC proxy error:", err);
        res.status(502).json({ jsonrpc: "2.0", error: { code: -32603, message: "solana_rpc_proxy_failed" }, id: null });
    }
});
export default router;
