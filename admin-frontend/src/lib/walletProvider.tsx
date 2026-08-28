// src/lib/walletProvider.tsx
// 🔐 مزوّد محفظة سولانا الموحّد (Capacitor/WebView + متصفح)
// - على الموبايل: محوّل WalletConnect (يبقى المستخدم داخل التطبيق ويتفاعل مع Phantom عبر deep link)
// - على الويب/سطح المكتب: محوّل Phantom المُحقون (window.solana)
// يقوم بفتح روابط المحفظة عبر @capacitor/browser لأن WebView لا يفتح الروابط المخصصة بمفرده.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { Connection, Transaction } from "@solana/web3.js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { isMobile, isInsideWalletApp, getInjectedProvider, signMessage as signWithInjected } from "./walletEnv";
import {
  connectPhantomMobile,
  signMessagePhantomMobile,
  sendTransactionPhantomMobile,
  resetPhantomSession,
} from "./phantomDeeplink";

// 🔑 معرّف مشروع WalletConnect (Reown Cloud) — ضروري لربط المحفظة على الموبايل.
// احصل عليه مجاناً من https://cloud.reown.com ثم ضعه في ملف .env.prduction:
//   VITE_WC_PROJECT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
const WC_PROJECT_ID = (import.meta.env.VITE_WC_PROJECT_ID as string | undefined) || "";

const RPC_URL =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
  "https://api.devnet.solana.com";

// 🔡 تحويل Uint8Array → Base64 (متوافق مع السيرفر الذي يوقّع رسالة الدخول)
function base64FromUint8(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// 🪟 داخل Capacitor: اجعل window.open يفتح روابط المحفظة في متصفح النظام/المدمج
// لأن WebView لا يستطيع فتح روابط مثل phantom:// أو wc: بمفرده.
function useCapacitorWalletLinkBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const original = window.open?.bind(window);
    (window as any).open = (url?: string | URL, ...rest: any[]) => {
      const str = typeof url === "string" ? url : url?.toString() || "";
      if (
        str &&
        /^(phantom:|wc:|https:\/\/phantom\.app|https:\/\/wallet\.phantom|https:\/\/ul\.wallet\.phantom)/i.test(
          str,
        )
      ) {
        Browser.open({ url: str }).catch(() => {});
        return null;
      }
      return original ? original(url as any, ...rest) : null;
    };
    return () => {
      (window as any).open = original;
    };
  }, []);
}

// 🧩 سياق المحفظة المكشوف للمكوّنات
interface SolanaWalletContextValue {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  hasWalletConnect: boolean;
  connectWallet: () => Promise<string | null>;
  disconnectWallet: () => Promise<void>;
  signMessageBase64: (message: string) => Promise<string | null>;
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
}

const SolanaWalletContext = createContext<SolanaWalletContextValue | null>(null);

function buildAdapters() {
  const mobile = isMobile();
  const adapters: any[] = [];

  // على الموبايل خارج تطبيق المحفظة: نعتمد WalletConnect فقط (window.solana غير محقون)
  if (!mobile) {
    try {
      adapters.push(new PhantomWalletAdapter());
    } catch {
      /* تجاهل */
    }
  }

  if (WC_PROJECT_ID && (mobile || !mobile)) {
    try {
      adapters.push(
        new WalletConnectWalletAdapter({
          network: WalletAdapterNetwork.Devnet,
          options: {
            projectId: WC_PROJECT_ID,
            metadata: {
              name: "SOLKIT",
              description: "SOLKIT mining & rewards platform",
              url: "https://solkit.app",
              icons: ["https://solkit.app/icon-512.png"],
            },
          },
        }),
      );
    } catch {
      /* تجاهل */
    }
  }

  return adapters;
}

function WalletContextBridge({ children }: { children: ReactNode }) {
  const {
    publicKey,
    connected,
    connecting,
    connect,
    disconnect,
    select,
    wallets,
    signMessage,
    sendTransaction,
  } = useWallet();

  useCapacitorWalletLinkBridge();

  // 📱 عنوان المحفظة عند الربط عبر رابط Phantom الموحّد (خارج تطبيق المحفظة)
  const [phantomAddress, setPhantomAddress] = useState<string | null>(null);

  const nativeMobile = Capacitor.isNativePlatform() && !isInsideWalletApp();

  const address = publicKey?.toBase58() ?? phantomAddress;
  const hasWalletConnect = useMemo(
    () => wallets.some((w) => w.adapter.name === "WalletConnect"),
    [wallets],
  );

  const connectWallet = useCallback(async (): Promise<string | null> => {
    // 🪟 متصفح المحفظة المدمج / الويب مع امتداد Phantom (window.solana متاح):
    // نستخدم المزوّد المحقون مباشرةً، وonlyIfTrusted:true أولًا لإعادة الربط الصامتة
    // (بلا نافذة تكرار) ثم false عند الحاجة لعرض التأكيد. ونخزّن العنوان حتى لا
    // تعتقد الصفحة أن الربط مفقود.
    if (isInsideWalletApp()) {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("no_injected_provider");
      let resp: any;
      try {
        resp = await provider.connect({ onlyIfTrusted: true });
      } catch (e: any) {
        console.error("[PHANTOM] connect silent failed:", e);
        resp = await provider.connect();
      }
      const addr = resp?.publicKey?.toString() || null;
      if (!addr) throw new Error("connect_no_address");
      setPhantomAddress(addr);
      return addr;
    }

    // 📱 تطبيق الموبايل الأصلي (Capacitor)
    if (Capacitor.isNativePlatform()) {
      // إن وُجد WalletConnect مُهيّأ استخدمه (يحتاج VITE_WC_PROJECT_ID)
      if (hasWalletConnect) {
        const target =
          wallets.find((w) => w.adapter.name === "WalletConnect") || wallets[0];
        if (target) {
          select(target.adapter.name);
          await connect();
          const addr = target.adapter.publicKey?.toBase58() ?? null;
          if (addr) setPhantomAddress(addr);
          return addr;
        }
      }
      // وإلا افتح رابط Phantom الموحّد الذي يُظهر نافذة "ربط التطبيق" الحقيقية
      const addr = await connectPhantomMobile();
      setPhantomAddress(addr);
      return addr;
    }

    // 💻 الويب/سطح المكتب (بدون امتداد محقون): محوّل wallet-adapter كاحتياطي
    const target =
      wallets.find((w) => w.adapter.name === "Phantom") || wallets[0];
    if (!target) throw new Error("no_wallet_adapter");
    select(target.adapter.name);
    await connect();
    const addr = target.adapter.publicKey?.toBase58() ?? null;
    if (addr) setPhantomAddress(addr);
    return addr;
  }, [wallets, select, connect, hasWalletConnect]);

  const disconnectWallet = useCallback(async () => {
    setPhantomAddress(null);
    resetPhantomSession();
    try {
      await disconnect();
    } catch {
      /* تجاهل */
    }
  }, [disconnect]);

  const signMessageBase64 = useCallback(
    async (message: string): Promise<string | null> => {
      // 🧪 تحديد طريق التوقيع المستخدم لتشخيص البيئة من الكونسول
      console.log(
        "[LOGIN] sign path:",
        nativeMobile ? "native-mobile-deeplink" : isInsideWalletApp() ? "inside-wallet-app(injected)" : "adapters/solana"
      );
      // 📱 موبايل أصلي خارج المحفظة: استخدم رابط التوقيع الموحّد (يُظهر نافذة التوقيع)
      if (nativeMobile && phantomAddress) {
        return await signMessagePhantomMobile(message);
      }
      // 🪟 داخل متصفح المحفظة المدمج (أو امتداد المتصفح)
      if (isInsideWalletApp()) {
        // no auto-retry؛ الخطأ الفعلي يُعاد رميه للواجهة لعرضه (ليست «أُلغي»).
        // لا نتراجع لمحوّل الويب هنا لتجنّب نافذة توقيع ثانية مضللة.
        return await signWithInjected(message);
      }
      // 💻 محوّل الويب/سطح المكتب (إرجاع null بدل رمي استثناء لتظهر الواجهة الرسالة
      // الصحيحة؛ لا إعادة محاولة تلقائية لتجنّب نافذة توقيع ثانية مضللة)
      if (!signMessage) return null;
      try {
        const sig = await signMessage(new TextEncoder().encode(message));
        if (sig) return base64FromUint8(sig);
      } catch (e: any) {
        console.warn("[PHANTOM] adapter signMessage failed:", e?.message || e);
      }
      return null;
    },
    [nativeMobile, phantomAddress, signMessage],
  );

  const sendTransactionSafe = useCallback(
    async (transaction: Transaction, connection: Connection): Promise<string> => {
      // 📱 موبايل أصلي خارج المحفظة: صفّ المحفظة عبر رابط الإرسال الموحّد
      if (nativeMobile && phantomAddress) {
        const serialized = transaction.serialize({ requireAllSignatures: false });
        return await sendTransactionPhantomMobile(serialized, connection);
      }

      // 🪟 داخل متصفح المحفظة المدمج: نستخدم المزوّد المحقون مباشرةً
      if (isInsideWalletApp()) {
        const injected = getInjectedProvider();
        if (injected?.signAndSendTransaction) {
          const { signature } = await injected.signAndSendTransaction(transaction);
          return signature as string;
        }
        if (injected?.signTransaction) {
          const signed = await injected.signTransaction(transaction);
          return await connection.sendRawTransaction(
            (signed as any).serialize({ requireAllSignatures: false }),
          );
        }
        throw new Error("injected_send_unavailable");
      }

      // 💻 الويب/سطح المكتب: نفضّل المزوّد المحقون مباشرةً (يتفادى WalletNotSelectedError
      // الناجم عن ضياع حالة wallet-adapter) ونبثّ المعاملة عبر اتصالنا (البروكسي devnet).
      const injected = getInjectedProvider();
      if (injected && typeof injected.signTransaction === "function") {
        const signed = await injected.signTransaction(transaction);
        return await connection.sendRawTransaction(
          (signed as any).serialize({ requireAllSignatures: false }),
        );
      }

      // احتياطي: محوّل wallet-adapter
      if (!sendTransaction) throw new Error("sendTransaction_unavailable");
      return await sendTransaction(transaction, connection);
    },
    [nativeMobile, phantomAddress, sendTransaction],
  );

  const value = useMemo<SolanaWalletContextValue>(
    () => ({
      connected,
      connecting,
      address,
      hasWalletConnect,
      connectWallet,
      disconnectWallet,
      signMessageBase64,
      sendTransaction: sendTransactionSafe,
    }),
    [
      connected,
      connecting,
      address,
      hasWalletConnect,
      connectWallet,
      disconnectWallet,
      signMessageBase64,
      sendTransactionSafe,
    ],
  );

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
    </SolanaWalletContext.Provider>
  );
}

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const adapters = useMemo(() => buildAdapters(), []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={adapters} autoConnect={false}>
        <WalletContextBridge>{children}</WalletContextBridge>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function useSolanaWallet(): SolanaWalletContextValue {
  const ctx = useContext(SolanaWalletContext);
  if (!ctx) {
    throw new Error("useSolanaWallet must be used within <SolanaWalletProvider>");
  }
  return ctx;
}
