// src/lib/walletEnv.ts
// 🛰️ أدوات كشف بيئة المحفظة + التوجيه الآمن لفتح التطبيق على الموبايل
// يستخدم الرابط الموحّد الرسمي لـ Phantom (Universal Link) لفتح الموقع داخل
// متصفح المحفظة المدمج حيث يتوفر window.solana — فتعمل التسجيل والتوقيع بأمان.

export interface InjectedProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array; publicKey: { toString(): string } }>;
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
// ⚠️ نفضّل window.phantom.solana (كائن Phantom الصريح) على window.solana العام،
// لأنه إذا كانت هناك إضافات محافظ أخرى في المتصفح فقد تحقن window.solana
// بدلاً من Phantom فيعطي أخطاء توقيع غامضة مثل "Unexpected error" (code -32603).
export const getInjectedProvider = (): InjectedProvider | null => {
  if (typeof window === "undefined") return null;
  const phantom = (window as any).phantom?.solana;
  if (phantom && (phantom.isPhantom || typeof phantom.connect === "function")) return phantom;
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
// ⚠️ لا نعيد المحاولة تلقائياً هنا: الإعادة تُظهر نافذة توقيع ثانية مضللة،
// والأفضل أن يُعيد المستخدم النقر بنفسه (نقرة جديدة = نافذة توقيع جديدة صادقة).
// 🧪 نكشف سبب الفشل الحقيقي: إلغاء المستخدم (مثل 4001/رفض) → نعيد null
// كي تعرض الواجهة «تم الإلغاء»، وأي خطأ تقني آخر → نرميه برمز واضح بدل
// إخفائه خلف رسالة «أُلغي» المضللة.
export const signMessage = async (message: string): Promise<string | null> => {
  const provider = getInjectedProvider();
  if (!provider || typeof provider.signMessage !== "function") {
    throw new Error("sign_no_provider");
  }
  try {
    const encoded = new TextEncoder().encode(message);
    // ⚠️ حاسم: رسالة نصية UTF-8 يجب أن تُوقَّع مع تمرير "utf8" كوسيط ثانٍ،
    // وإلا يرفضها Phantom بـ "Unexpected error" (خطأ موثّق رسمياً).
    const result: any = await provider.signMessage(encoded, "utf8");
    let signature: Uint8Array | undefined;
    if (result instanceof Uint8Array) signature = result;
    else signature = result?.signature;
    if (!signature || !signature.length) return null;
    // تحويل Uint8Array → Base64
    let binary = "";
    for (let i = 0; i < signature.length; i++) binary += String.fromCharCode(signature[i]);
    return btoa(binary);
  } catch (err: any) {
    // 🧪 تسجيل السبب الدقيق للتمكن من تشخيص المشكلة بدقة
    const raw = err?.message || String(err || "");
    const code = err?.code;
    console.warn("[PHANTOM] injected signMessage failed:", raw);
    // إلغاء حقيقي من المستخدم (رفض/إغلاق النافذة) → null ليعرض «تم الإلغاء»
    if (code === 4001 || /user rejected|user denied|user declined|request rejected|cancel|not approved/i.test(raw)) {
      return null;
    }
    // خطأ تقني فعلي (نافذة أُغلقت بلا استجابة، خطأ غير متوقع، دالة غير مدعومة...)
    if (/unexpected error|could not|not supported|timeout|network/i.test(raw)) {
      const e = new Error("sign_phantom_error");
      (e as any).raw = raw;
      throw e;
    }
    const e = new Error("sign_unknown");
    (e as any).raw = raw;
    throw e;
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
