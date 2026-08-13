// src/lib/walletEnv.ts
// 🛰️ أدوات كشف بيئة المحفظة + التوجيه الآمن لفتح التطبيق على الموبايل
// يستخدم الرابط الموحّد الرسمي لـ Phantom (Universal Link) لفتح الموقع داخل
// متصفح المحفظة المدمج حيث يتوفر window.solana — فتعمل التسجيل والتوقيع بأمان.

export interface InjectedProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction: (...args: any[]) => Promise<any>;
  [key: string]: any;
}

declare global {
  interface Window {
    solana?: InjectedProvider;
    solflare?: InjectedProvider;
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
