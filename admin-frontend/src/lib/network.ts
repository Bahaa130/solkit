// src/lib/network.ts
// 🌐 قرار الشبكة الوحيد (devnet / mainnet-beta): يُقرأ مرة واحدة من إعدادات الخادم
// (GET /api/users/settings ← solanaNetwork) ليستخدمه كل مكوّن يبني معاملاتٍ أو يوقّعها.
// ضمان الاتساق بين المحفظة (مثلاً على الشبكة الحقيقية) والشبكة التي تُبنى عليها
// المعاملة — وإلا ظهر خطأ التوقيع العام "Unexpected error" من المحفظة.

import { apiFetch, API_BASE } from "./api";

export interface NetCfg {
  network: string; // "devnet" | "mainnet-beta"
  rpc: string;
}

let cache: NetCfg | null = null;
let inflight: Promise<NetCfg> | null = null;

/** رابط RPC المباشر للشبكة (نقطة سولانا العمومية) — للاستخدام الاحتياطي فقط. */
export function rpcDirectUrl(network: string): string {
  return network === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

/** رابط RPC عبر بروكسي خادمنا (نفس أصل التطبيق): يوقظ الخادم عند الحاجة،
 * يتجاوز قيود المتصفح/WebView، ويوجّه إلى شبكة المدير المضبوطة. */
export function rpcProxyUrl(): string {
  return `${API_BASE}/api/solana/rpc`;
}

/** رابط RPC للشبكة — إعداد بيئة VITE_SOLANA_RPC_URL يتفوّق إن وُجد،
 * وإلا نفضّل بروكسي الخادم (موثوق داخل WebView ويعمل حتى لو لم يصل
 * هاتف المستخدم إلى نقطة سولانا العمومية مباشرة). */
export function rpcUrlFor(network: string): string {
  const override = import.meta.env.VITE_SOLANA_RPC_URL as string | undefined;
  if (override) return override;
  void network; // الشبكة تُوجَّه من جهة الخادم داخل البروكسي نفسه
  return rpcProxyUrl();
}

/** جلب إعداد الشبكة الحيّ من الخادم مع تلقيم/تخزين مؤقت وطلب واحد متزامن. */
export async function getNetworkConfig(): Promise<NetCfg> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    let network = "devnet";
    try {
      const res = await apiFetch("/api/users/settings");
      if (res.ok) {
        const s = await res.json();
        if (s && (s.solanaNetwork === "devnet" || s.solanaNetwork === "mainnet-beta")) {
          network = s.solanaNetwork;
        }
      }
    } catch { /* تبقى الشبكة الافتراضية عند تعذّر الاتصال */ }
    cache = { network, rpc: rpcUrlFor(network) };
    return cache;
  })();
  return inflight;
}