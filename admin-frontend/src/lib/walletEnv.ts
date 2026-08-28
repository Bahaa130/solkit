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
// 🔁 تُعاد المحاولة تلقائياً مرة واحدة إن فشل التوقيع بخطأ تقني عابر (تزاحم طلبات
// الامتداد يرمي أحياناً "User rejected" زائفة بعد قبول المستخدم)؛ أما الإلغاء الحقيقي
// من المستخدم فنعترف به فوراً ولا نعيد المحاولة.
export const signMessage = async (message: string): Promise<string | null> => {
  const provider = getInjectedProvider();
  if (!provider || typeof provider.signMessage !== "function") return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const encoded = new TextEncoder().encode(message);
      // Phantom يُرجع { signature: Uint8Array, publicKey }، وأحيانًا Uint8Array مباشرةً
      const result: any = await provider.signMessage(encoded);
      let signature: Uint8Array | undefined;
      if (result instanceof Uint8Array) signature = result;
      else signature = result?.signature;
      if (!signature || !signature.length) return null;
      // تحويل Uint8Array → Base64
      let binary = "";
      for (let i = 0; i < signature.length; i++) binary += String.fromCharCode(signature[i]);
      return btoa(binary);
    } catch (err: any) {
      const msg = err?.message || String(err);
      // إلغاء/رفض حقيقي من المستخدم — لا نعاد المحاولة
      if (/rejected|denied|declined|cancel|not\s*approved/i.test(msg)) return null;
      // خطأ تقني عابر (تزاحم الطلبات) — نعيد المحاولة بعد مهلة قصيرة
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      return null;
    }
  }
  return null;
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
