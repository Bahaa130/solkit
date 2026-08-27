// src/lib/walletEnv.ts
// 🛰️ أدوات كشف بيئة المحفظة + التوجيه الآمن لفتح التطبيق على الموبايل
// يستخدم الرابط الموحّد الرسمي لـ Phantom (Universal Link) لفتح الموقع داخل
// متصفح المحفظة المدمج حيث يتوفر window.solana — فتعمل التسجيل والتوقيع بأمان.

export interface InjectedProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array; publicKey: { toString(): string } }>;
  signAndSendTransaction: (...args: any[]) => Promise<any>;
  [key: string]: any;
}

declare global {
  interface Window {
    solana?: any;
    solflare?: any;
  }
}

// 🔎 إرجاع مزوّد المحفظة المحقون إن وُجد (داخل Phantom/Solflare In-App Browser)
export const getInjectedProvider = (): InjectedProvider | null => {
  if (typeof window === "undefined") return null;
  const p = window.solana;
  if (p && (p.isPhantom || p.isSolflare || typeof p.connect === "function")) return p;
  if (window.solflare) return window.solflare;
  return null;
};

// 🔌 التأكد من اتصال المحفظة وإرجاع العنوان (يُظهر modal التأكيد إن لزم)
// داخل Phantom In-App Browser: connect() يمرّر العنوان مباشرة (trusted)،
// لكن نستدعيه دائماً لضمان تحميل publicKey قبل أي توقيع/دفع.
export const ensureConnected = async (): Promise<string | null> => {
  const provider = getInjectedProvider();
  if (!provider) return null;
  try {
    const resp = await provider.connect({ onlyIfTrusted: false });
    return resp.publicKey?.toString() || null;
  } catch {
    return null;
  }
};

// ✍️ توقيع رسالة نصية عبر محفظة Phantom (يُظهر نافذة التوقيع الحقيقية داخل التطبيق).
// نعيد التوقيع Base64 جاهزاً للإرسال عبر JSON إلى السيرفر للتحقق منه.
export const signMessage = async (message: string): Promise<string | null> => {
  const provider = getInjectedProvider();
  if (!provider || typeof provider.signMessage !== "function") return null;
  try {
    const encoded = new TextEncoder().encode(message);
    // Phantom يُرجع { signature: Uint8Array, publicKey }
    const result: any = await provider.signMessage(encoded);
    const signature: Uint8Array | undefined = result?.signature;
    if (!signature || !signature.length) return null;
    // تحويل Uint8Array → Base64
    let binary = "";
    for (let i = 0; i < signature.length; i++) binary += String.fromCharCode(signature[i]);
    return btoa(binary);
  } catch {
    return null;
  }
};


// 📱 هل نحن على متصفح هاتف؟
export const isMobile = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
};

// 🔒 هل نحن داخل متصفح محفظة مدمج (window.solana متاح)؟
export const isInsideWalletApp = (): boolean => getInjectedProvider() !== null;

// 🚀 فتح الموقع داخل تطبيق Phantom عبر الرابط الموحّد الرسمي.
// هذا يفتح التطبيق ويحمّل الموقع بداخله، حيث يتوفر window.solana والتوقيع الآمن.
export const openInWalletApp = (): void => {
  const target = encodeURIComponent(window.location.href);
  window.location.href = `https://phantom.app/ul/v1/browse/${target}?ref=SOLKIT`;
};
