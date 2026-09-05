import { apiFetch } from "./lib/api";
import React, { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import ConnectWalletPage from "./pages/ConnectWalletPage";
import HomePage from "./pages/HomePage";
import ReferralPage from "./pages/ReferralPage";
import TasksPage from "./pages/TasksPage";
import BonusPage from "./pages/BonusPage";
import AdminPanelPage from "./pages/AdminPanelPage";
import AirdropPage from "./pages/AirdropPage";
import LevelsPage from "./pages/LevelsPage";
import NotFoundPage from "./pages/NotFoundPage";
import MaintenancePage from "./pages/MaintenancePage";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { C, font, styles as T2 } from "./theme";
import { LANGS } from "./i18n/lang.ts";
import { useLang } from "./i18n/index.tsx";
import { useBranding } from "./branding";
import CoinIcon from "./components/CoinIcon";
import { useSolanaWallet } from "./lib/walletProvider";

const ADMIN_WALLET = "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";
const SOLANA_RPC_URL = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || "https://api.devnet.solana.com";

// 🔁 جلب آخر blockhash مع إعادة محاولة تلقائية لتجاوز أوقات الازدحام/بطء الشبكة.
// المسار الأول عبر web3.js Connection، والثاني عبر fetch مباشر (نفس آلية apiFetch
// التي تعمل لتسجيل الدخول داخل تطبيق الموبايل) — فيرمي خطأً يحوي تفاصيل آخر فشل.
async function fetchBlockhashWithRetry(
  connection: Connection,
  report: (label: string, err: unknown) => void,
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
      const res = await fetch(SOLANA_RPC_URL, {
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

// 💰 مبالغ التفعيل تُقرأ من إعدادات المدير (تظهر وتُبنى ديناميكياً) — الافتراضي 0.015+0.015 = 0.03 SOL
const DEFAULT_FEE = { fullLamports: 30000000, halfLamports: 15000000, siteShare: 0.015, referrerShare: 0.015 };

interface Session {
  userId: number;
  walletAddress: string;
  jwtToken?: string;
  role?: string;
  activationStatus?: string;
}

type PayPhase =
  | { type: "loading"; text: string }
  | { type: "confirming"; text: string }
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | null;

export default function App() {
  const { lang, dir, meta, setLang, t } = useLang();
  const { branding } = useBranding();
  const { address: walletAddressHook, connectWallet, sendTransaction } = useSolanaWallet();
  const [session, setSession] = useState<Session | null>(null);
  // 🗺️ قائمة التبويبات المعروفة (تُستخدم لفلترة المسارات غير الصالحة → 404)
  const KNOWN_TABS = ["home", "airdrop", "referral", "tasks", "bonus", "admin", "levels"];
  // 🔗 قراءة التبويب من معامل ?tab= في الرابط عند التحميل (قيمة غير معروفة → "404")
  const [activeTab, setActiveTab] = useState<string>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab && KNOWN_TABS.includes(tab) ? tab : (tab ? "404" : "home");
  });
  // 🔗 تنقّل موحّد: يبدّل التبويب ويحدّث رابط ?tab= في المتصفح
  const navigateTab = (tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  };
  const [payLoading, setPayLoading] = useState<boolean>(false);
  const [payStatus, setPayStatus] = useState<PayPhase>(null);
  const [refCode, setRefCode] = useState<string>("");
  const [langOpen, setLangOpen] = useState(false);
  // 🔧 حالة الصيانة (تُجلب من الخادم عند التحميل)
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(null);
  // 💰 رسوم التفعيل ومبالغ التقسيم يتحكم بها المدير — تُجلب من إعدادات الخادم
  const [feeCfg, setFeeCfg] = useState(DEFAULT_FEE);
  // 💫 شاشة التحميل الترحيبية:
  // - في تطبيق أندرويد (Capacitor): تُعرض في كل فتح للتطبيق لمدة 3 ثوانٍ (بداية تحميل المشروع)،
  //   حتى يبدو فتح التطبيق وكأنه تحميل حقيقي.
  // - في المتصفح العادي: مرة واحدة فقط بعد كل تثبيت (localStorage ثابت عبر الإقلاعات).
  // - وتُتخطّى تماماً عند سحب التحديث (sessionStorage skip).
  const [splash, setSplash] = useState(() => {
    try {
      // سحب التحديث → لا نعيد شاشة التحميل بعد إعادة التحميل مباشرة
      if (sessionStorage.getItem("solkit_skip_splash")) {
        sessionStorage.removeItem("solkit_skip_splash");
        return false;
      }
      // أندرويد: شاشة التحميل في كل فتح
      if (Capacitor.isNativePlatform()) return true;
      // أول فتح بعد التثبيت فقط: نعرض الشاشة ونحتفظ بالعلامة إلى الأبد
      if (localStorage.getItem("solkit_splash_shown")) return false;
      localStorage.setItem("solkit_splash_shown", "1");
    } catch { /* تجاهل */ }
    return true;
  });
  useEffect(() => {
    if (!splash) return;
    const id = setTimeout(() => setSplash(false), 3000);
    return () => clearTimeout(id);
  }, [splash]);

  // ⬇️ سحب من أعلى لأسفل → تحديث الصفحة (pull-to-refresh) — إصدار أندرويد الدقيق:
  // 1) العتبة السلبية ENGAGE: اللمسات الصغيرة والحركات الدقيقة أثناء النقر لا تُفعّل السحب
  //    ولا تسرق التمرير (تورِث الحركة للمتصفح).
  // 2) مقياس الاتجاه: إن كانت الحركة أفقية أكثر منها رأسية نُحجم فوراً (تجنّب سرقة سواقات).
  // 3) نعمل فقط عندما تكون الصفحة فعلاً في أعلى الشاشة (النافذة الرئيسية أو أي قائمة داخلية
  //    تحت الإصبع هي التي أمسكت بالتمرير) — لا نعترض القوائم في منتصفها.
  // 4) قفل الإقلاع BOOT_LOCK: أول ~0.8 ثانية من فتح التطبيق لا يلتقط أي لمسة — يمنع أي
  //    إعادة تحميل غير مقصودة عند الفتح.
  // 5) تحديث المؤشر عبر requestAnimationFrame فقط — لا إجهاد على واجهة WebView الأندرويد،
  //    وoverscroll-behavior: contain في CSS يعطّل انزلاق التحديث الأصلي للنظام حتى لا يصطدم بسحبنا.
  const mainRef = useRef<HTMLElement | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // 🔄 تطبيق أندرويد: زر تحديث ظاهر بدل السحب (سحب التحديث معطّل هناك عبر القفل أدناه)
  const isNativeApp = Capacitor.isNativePlatform();
  const [nativeRefreshing, setNativeRefreshing] = useState(false);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // 🛑 الأندرويد يستخدم زر التحديث بدلاً من السحب
    const PULL_T = 64;
    const ENGAGE = 12;
    const BOOT_LOCK_MS = 800;
    const bootedAt = Date.now();

    let active = false;
    let engaged = false;
    let startX = 0;
    let startY = 0;
    let pullVal = 0;
    let fired = false;
    let raf = 0;

    // تطبيق القيمة على الـ state داخل إطار رسم واحد فقط (أقصى أداء على الأندرويد)
    const applyPull = () => { raf = 0; setPull(pullVal); };
    const schedulePull = () => {
      if (!raf) raf = requestAnimationFrame(applyPull);
    };

    const setTouchAction = (v: string) => {
      try {
        document.documentElement.style.touchAction = v;
        (document.body as HTMLElement).style.touchAction = v;
      } catch { /* تجاهل */ }
    };
    const reset = (silent = false) => {
      active = false;
      engaged = false;
      pullVal = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!silent) setPull(0);
      setTouchAction("");
    };

    // 📦 أقرب حاوية تمرير عمودية حقيقية تحت الإصبع (حتى لو كانت قائمة داخلية)
    const scrollContainerOf = (node: EventTarget | null): HTMLElement | null => {
      let n: HTMLElement | null = node as HTMLElement;
      while (n && n.nodeType === 1 && n !== mainRef.current && n !== document.body && n !== document.documentElement) {
        const s = getComputedStyle(n).overflowY;
        if (/(auto|scroll)/.test(s) && n.scrollHeight > n.clientHeight + 2) return n;
        n = n.parentElement;
      }
      return mainRef.current;
    };

    // هل الصفحة فعلاً في أعلى الشاشة؟ (النافذة + الحاوية الأقرب تحت الإصبع)
    const isAtTop = (target: EventTarget | null) => {
      if (window.scrollY > 1) return false;
      const sc = scrollContainerOf(target);
      return sc ? sc.scrollTop <= 1 : true;
    };

    const onStart = (e: TouchEvent) => {
      if (Date.now() - bootedAt < BOOT_LOCK_MS) return; // 🛡️ قفل الإقلاع
      if (e.touches.length !== 1 || fired) return;
      if (!isAtTop(e.target)) return;
      active = true;
      engaged = false;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pullVal = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || fired) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      // 🔍 لم يتجاوز حد التموّت أو الحركة جانبية أكثر → نتخلى فوراً ونعيد التمرير الطبيعي
      if (dy <= ENGAGE || Math.abs(dx) > Math.abs(dy)) {
        if (engaged) reset();
        return;
      }
      if (!isAtTop(e.target)) { reset(); return; }
      if (!engaged) {
        engaged = true;
        setTouchAction("none"); // فقط بعد التأكد من أنه سحب حقيقي
      }
      try { e.preventDefault(); } catch { /* تجاهل */ } // يلغي التمرير الأصلي — مضمون في أي WebView
      pullVal = Math.min(dy - ENGAGE, PULL_T + 26) * 0.62;
      schedulePull();
    };

    const onEnd = (e: TouchEvent) => {
      if (active && engaged && e.cancelable) {
        try { e.preventDefault(); } catch { /* تجاهل */ }
      }
      if (!active) return;
      active = false;
      const doRefresh = engaged && !fired && pullVal >= PULL_T;
      engaged = false;
      setTouchAction("");
      if (doRefresh) {
        fired = true; // 🚫 لا إعادة تحميل ثانية حتى لو جاءت لمسة أخرى
        setRefreshing(true);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        setPull(PULL_T);
        try { sessionStorage.setItem("solkit_skip_splash", "1"); } catch { /* تجاهل */ }
        setTimeout(() => window.location.reload(), 160);
      } else {
        setPull(0);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
    document.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      if (raf) cancelAnimationFrame(raf);
      setTouchAction("");
    };
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setSession(null);
    setActiveTab("home");
    setPayStatus(null);
  };

  const parseJwt = (token: string) => {
    try {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  // 🔗 مزامنة التبويب مع الرابط (؟tab=) + الاستماع لأزرار المتصفح (أمام/خلف)
  // أي قيمة غير معروفة في الرابط تُظهر صفحة 404 بدل التحديث الأعمى
  useEffect(() => {
    const syncUrl = () => {
      const params = new URLSearchParams(window.location.search);
      if (activeTab === "home") params.delete("tab");
      else params.set("tab", activeTab);
      const newUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, "");
      window.history.replaceState(null, "", newUrl);
    };
    syncUrl();

    const onPopState = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(tab && KNOWN_TABS.includes(tab) ? tab : (tab ? "404" : "home"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activeTab]);

  // 🔧 فحص وضع الصيانة عند التحميل + استطلاع دوري (polling) لتحديث الحالة دون إعادة تحميل
  useEffect(() => {
    let cancelled = false;
    let intervalId: number;

    const checkMaintenance = async () => {
      try {
        const res = await apiFetch("/api/users/settings");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setMaintenance({ enabled: Boolean(data.maintenanceMode), message: data.maintenanceMessage || "" });
            setFeeCfg({
              fullLamports: Number(data.activationFullLamports) || DEFAULT_FEE.fullLamports,
              halfLamports: Number(data.activationHalfLamports) || DEFAULT_FEE.halfLamports,
              siteShare: Number(data.siteShare ?? DEFAULT_FEE.siteShare),
              referrerShare: Number(data.referrerShare ?? DEFAULT_FEE.referrerShare),
            });
          }
        } else if (!cancelled) {
          setMaintenance({ enabled: false, message: "" });
        }
      } catch {
        if (!cancelled) setMaintenance({ enabled: false, message: "" });
      }
    };

    checkMaintenance(); // فحص فوري عند التحميل
    intervalId = window.setInterval(checkMaintenance, 30000); // ثم كل 30 ثانية

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const savedJwt = localStorage.getItem("solkit_token");
    const savedWallet = localStorage.getItem("solkit_wallet");
    const savedRole = localStorage.getItem("solkit_role");
    const savedStatus = localStorage.getItem("solkit_status");

    if (savedJwt && savedWallet) {
      const payload = parseJwt(savedJwt);
      const resolvedUserId = payload?.id || payload?.userId || 0;

      if (resolvedUserId > 0) {
        setSession({
          userId: Number(resolvedUserId),
          walletAddress: savedWallet,
          jwtToken: savedJwt,
          role: savedRole ?? "user",
          activationStatus: savedStatus ?? "inactive"
        });
      }
    }
  }, []);

  const handleWalletConnected = (jwtToken: string, walletAddress: string, role: string, activationStatus: string) => {
    localStorage.setItem("solkit_token", jwtToken);
    localStorage.setItem("solkit_wallet", walletAddress);
    localStorage.setItem("solkit_role", role);
    localStorage.setItem("solkit_status", activationStatus);

    const payload = parseJwt(jwtToken);
    const resolvedUserId = payload?.id || payload?.userId || 0;

    setSession({
      userId: Number(resolvedUserId),
      walletAddress,
      jwtToken,
      role,
      activationStatus
    });
  };

  const handlePaymentActivation = async () => {
    if (!session?.jwtToken) return;

    try {
      setPayLoading(true);
      setPayStatus({ type: "loading", text: t("app.payPreparing") });

      // 🔌 التأكد من اتصال المحفظة (ضروري للتوقيع داخل التطبيق)
      let signerAddress = walletAddressHook;
      if (!signerAddress) {
        signerAddress = (await connectWallet()) || null;
      }
      if (!signerAddress) {
        setPayStatus({ type: "error", text: t("app.noPhantom") });
        return;
      }

      const connection = new Connection(SOLANA_RPC_URL, "confirmed");
      const siteAdminPublicKey = new PublicKey(ADMIN_WALLET);
      const userPublicKey = new PublicKey(signerAddress);

      // 1. جلب بيانات السجل الحية لمعرفة محفظة الـ Referrer
      const checkUserRes = await apiFetch(`/api/users/${session.userId}`, {
        headers: { "Authorization": `Bearer ${session.jwtToken}` }
      });
      if (!checkUserRes.ok) {
        throw new Error(t("app.payCheckRefFailed"));
      }
      const userData = await checkUserRes.json();
      let referrerWalletAddress: string | null = userData?.referrer?.walletAddress || null;

      // 🔗 لصق كود إحالة أثناء الدفع: إن لم يكن للمستخدم محيل من قبل والكود مكتوب،
      // نتحقق منه عبر الخادم ونستخدم محفظة صاحبه لبناء المعاملة المقسّمة.
      let appliedReferralCode: string | undefined;
      const typedCode = refCode.trim();
      if (!referrerWalletAddress && typedCode) {
        const refRes = await apiFetch("/api/users/resolve-referral", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.jwtToken}`
          },
          body: JSON.stringify({ referralCode: typedCode })
        });
        const refData = await refRes.json().catch(() => ({}));
        if (!refRes.ok || !refData?.valid) {
          throw new Error(refData?.message || t("app.refCodeInvalid"));
        }
        referrerWalletAddress = refData.walletAddress;
        appliedReferralCode = typedCode;
      }

      // 2. بناء المعاملة الموحّدة: تقسيم 0.015 + 0.015 مع إحالة، أو 0.03 كاملة بدونها
      const transaction = new Transaction();

      if (referrerWalletAddress) {
        setPayStatus({ type: "loading", text: t("app.payWithRef") });
        const referrerPublicKey = new PublicKey(referrerWalletAddress);

        if (referrerPublicKey.toBase58() === siteAdminPublicKey.toBase58()) {
          throw new Error(t("app.payReferrerSame"));
        }

        // أ. 0.015 SOL لمحفظة الموقع
        transaction.add(
          SystemProgram.transfer({ fromPubkey: userPublicKey, toPubkey: siteAdminPublicKey, lamports: feeCfg.halfLamports })
        );
        // ب. نصف رسوم التفعيل لصاحب الإحالة الحقيقي
        transaction.add(
          SystemProgram.transfer({ fromPubkey: userPublicKey, toPubkey: referrerPublicKey, lamports: feeCfg.halfLamports })
        );
      } else {
        setPayStatus({ type: "loading", text: t("app.payNoRef") });
        transaction.add(
          SystemProgram.transfer({ fromPubkey: userPublicKey, toPubkey: siteAdminPublicKey, lamports: feeCfg.fullLamports })
        );
      }

      transaction.feePayer = userPublicKey;
      let latestBlockHashInfo: { blockhash: string; lastValidBlockHeight: number } | null = null;
      try {
        latestBlockHashInfo = await fetchBlockhashWithRetry(connection, (label, err) =>
          console.warn("[blockhash]", label, err),
        );
      } catch (err) {
        const detail =
          err instanceof Error ? err.message.replace(/^RPC unreachable :: /, "") : "network";
        setPayStatus({ type: "error", text: `${t("app.payRpcFailed")} [${SOLANA_RPC_URL}] (${detail})` });
        return;
      }
      transaction.recentBlockhash = latestBlockHashInfo.blockhash;

      // 3. استدعاء المحفظة لتوقيع وبث المعاملة (Phantom على الويب / WalletConnect على الموبايل)
      setPayStatus({ type: "loading", text: t("app.payPhantomSign") });
      const txSignature = await sendTransaction(transaction, connection);

      if (!txSignature) throw new Error(t("app.payNoSig"));

      // 💾 تذكّر التوقيع محلياً: إن انقطع التطبيق قبل إرسال التوثيق يمكن استرجاع الدفعة
      // لاحقاً دون دفع مزدوج (السيرفر يتحقق من المعاملة على البلوكشين).
      localStorage.setItem("solkit_pending_tx", txSignature);

      setPayStatus({ type: "confirming", text: t("app.payConfirming") });
      // 🔁 التأكيد المحلي "أفضل جهد": لا يدعم Render WebSocket، لذا نضع مهلة قصوى
      // (15 ثانية) ولا ننتظرها أبداً — تأكيد السيرفر المباشر عبر RPC هو المرجع الحقيقي.
      try {
        await Promise.race([
          connection.confirmTransaction({
            signature: txSignature,
            blockhash: latestBlockHashInfo.blockhash,
            lastValidBlockHeight: latestBlockHashInfo.lastValidBlockHeight
          }, "confirmed").then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15000)),
        ]);
      } catch (confirmErr) {
        console.warn("Local confirmation skipped (server will re-verify):", confirmErr);
      }

      // 4. إرسال التوقيع للسيرفر لتفعيل الحساب وتسجيل التقسيم
      const res = await apiFetch("/api/users/activate-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.jwtToken}`
        },
        body: JSON.stringify({ txHash: txSignature, referralCode: appliedReferralCode })
      });

      const data = await res.json();
      if (res.ok) {
        setPayStatus({ type: "success", text: data.message || t("app.paySuccess") });
        localStorage.setItem("solkit_status", "active");
        localStorage.removeItem("solkit_pending_tx");
        setSession(prev => prev ? { ...prev, activationStatus: "active" } : null);
      } else {
        setPayStatus({ type: "error", text: data.message || t("app.payServerRefused") });
      }
    } catch (error) {
      console.error("Payment activation error:", error);
      setPayStatus({ type: "error", text: error instanceof Error ? error.message : t("app.payError") });
    } finally {
      setPayLoading(false);
    }
  };

  // 🔄 استرجاع التفعيل من دفعة سابقة = بُثّت على البلوكشين ولم يكتمل التفعيل.
  // يُرسل بدون txHash، والسيرفر يبحث عن الدفعة المؤهلة ويفعّل بها دون دفع مزدوج.
  const handleResumeActivation = async () => {
    if (!session?.jwtToken) return;
    try {
      setPayLoading(true);
      setPayStatus({ type: "loading", text: t("app.resumeChecking") });
      // ⏱️ مهلة أمان: لا نترك المستخدم ينتظر بلا رد إذا تعطل اتصال الخادم/الشبكة
      const res = await Promise.race([
        apiFetch("/api/users/activate-account", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.jwtToken}`
          },
          body: JSON.stringify({})
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error(t("resumeTimeout"))), 25000)),
      ]);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        localStorage.setItem("solkit_status", "active");
        localStorage.removeItem("solkit_pending_tx");
        setSession(prev => prev ? { ...prev, activationStatus: "active" } : null);
        setPayStatus({ type: "success", text: data.message || t("app.paySuccess") });
      } else {
        // 🧾 إذا لم يجد السيرفر دفعة سابقة مؤهلة نعرض رسالة واضحة بدل رسالة الرفض الغامضة
        const msg: string = data?.message || "";
        const noPayment = /TxHash|لم يتم العثور على المعاملة|دفع.*غير كاف/i.test(msg);
        setPayStatus({ type: "error", text: noPayment ? t("app.payNoPrevFound") : (msg || t("app.payServerRefused")) });
      }
    } catch (error: any) {
      console.error("Activation resume error:", error);
      setPayStatus({ type: "error", text: error?.message || t("app.payError") });
    } finally {
      setPayLoading(false);
    }
  };

  if (!session) {
    return (
      <>
        <ConnectWalletPage
          onWalletConnected={(t, w, r, s) => handleWalletConnected(t, w, r, s || "inactive")}
        />
        {splash && <SplashOverlay />}
      </>
    );
  }

  // 🔧 وضع الصيانة — يُعرض للجميع ما عدا محفظة المدير
  if (maintenance?.enabled && session.walletAddress !== ADMIN_WALLET) {
    return (
      <>
        <MaintenancePage onLogout={handleLogout} />
        {splash && <SplashOverlay />}
      </>
    );
  }

  const shortWallet = session.walletAddress
    ? `${session.walletAddress.slice(0, 4)}...${session.walletAddress.slice(-4)}`
    : "";

  const tabs = [
    { key: "home", icon: "🏠", adminOnly: false },
    { key: "airdrop", icon: "🪂", adminOnly: false },
    { key: "referral", icon: "🔗", adminOnly: false },
    { key: "tasks", icon: "🎁", adminOnly: false },
    { key: "bonus", icon: "📅", adminOnly: false },
    { key: "levels", icon: "🏆", adminOnly: false },
    { key: "admin", icon: "👑", adminOnly: true },
  ].filter((tb) => !tb.adminOnly || session.walletAddress === ADMIN_WALLET);

  const textAlign = dir === "rtl" ? "right" : "left";

  return (
    <div className="app-shell" style={{ ...styles.app, direction: dir }}>
      <header className="app-header" style={styles.header}>
        <div style={styles.logo}>
          <CoinIcon size={20} />
          <span className="gradient-text" style={{ fontWeight: 900, fontSize: 17 }}>{branding.projectName}</span>
          <span className="app-logoTag" style={styles.logoTag}>SYSTEM</span>
        </div>
        <div className="app-headerRight" style={styles.headerRight}>
          {/* 🌐 زر اللغة */}
          <div style={styles.langWrap}>
            <button onClick={() => setLangOpen((v) => !v)} className="btn btn-ghost app-langBtn" style={styles.langBtn}>
              🌐 {meta.flag}
            </button>
            {langOpen && (
              <div style={{ ...styles.langMenu, left: dir === "rtl" ? "auto" : 0, right: dir === "rtl" ? 0 : "auto" }}>
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLang(l.code); setLangOpen(false); }}
                    style={{ ...styles.langItem, textAlign, fontWeight: l.code === lang ? 900 : 500, color: l.code === lang ? C.teal : C.text }}
                  >
                    {l.flag} {l.label} {l.code === lang ? "✓" : ""}
                  </button>
                ))}
                <div style={styles.langSoon}>{t("app.langSoon")}</div>
              </div>
            )}
          </div>
          <span className="pill app-walletPill" style={{ border: "1px solid rgba(0,255,204,0.25)", color: C.teal, background: "rgba(0,255,204,0.08)" }}>🦊 <span className="wallet-addr">{shortWallet}</span></span>
          <button onClick={handleLogout} className="btn btn-ghost app-logoutBtn" style={{ padding: "8px 14px", fontSize: 12 }}>{t("app.logout")}</button>
        </div>
      </header>

      {session.activationStatus !== "active" && session.role !== "admin" ? (
        <div style={styles.payWrap}>
          <div className="glass" style={styles.payCard}>
            <div className="floaty" style={{ fontSize: 54, textAlign: "center" }}>🦊</div>
            <h2 style={styles.payTitle}>{t("app.payTitle")}</h2>
            <p style={styles.payDesc}>
              {t("app.payDesc")}{" "}
              <strong className="gradient-text" style={{ fontSize: 18 }}>{(feeCfg.fullLamports / 1e9).toFixed(3)} SOL</strong>.
            </p>

            <div style={{ ...styles.splitBox, textAlign }}>
              <div style={styles.splitRow}>
                <span className="pill" style={{ background: "rgba(0,255,204,0.1)", color: C.teal, border: "1px solid rgba(0,255,204,0.25)" }}>{t("app.siteWallet")}</span>
                <span style={{ fontWeight: 800, color: C.text }}>{(feeCfg.halfLamports / 1e9).toFixed(3)} SOL</span>
              </div>
              <div style={styles.splitRow}>
                <span className="pill" style={{ background: "rgba(124,92,255,0.12)", color: "#b3a1ff", border: "1px solid rgba(124,92,255,0.3)" }}>{t("app.referrer")}</span>
                <span style={{ fontWeight: 800, color: C.text }}>{(feeCfg.halfLamports / 1e9).toFixed(3)} SOL</span>
              </div>
              <p style={{ ...T2.hint, marginTop: 8 }}>{t("app.splitHint")}</p>
            </div>

            {/*
              💡 عبارة توضح سياسة الشفافية: لماذا رسوم اشتراك أصلية عند التسجيل؟
              لمنع الحسابات الوهمية وبناء فريق تسويقي حقيقي بصدق ووضوح.
            */}
            <p style={{ ...styles.feeWhy, textAlign }}>{t("app.feeWhy")}</p>

            {/*
              🔗 حقل لصق كود الإحالة (اختياري): المستخدم الذي سجّل بدون رابط دعوة
              يستطيع لصق كود صديقه هنا قبل الدفع — فيتحول الدفع تلقائياً لقسيم 0.015 + 0.015.
            */}
            <div style={{ ...styles.splitBox, textAlign, marginTop: 16 }}>
              <label style={{ display: "block", color: C.muted, fontSize: 12, marginBottom: 8 }}>{t("app.refCodeLabel")}</label>
              <div style={styles.refCodeRow}>
                <input
                  className="input"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.replace(/\s/g, ""))}
                  placeholder={t("app.refCodePlaceholder")}
                  dir="ltr"
                  style={{ textAlign: "center", fontWeight: 700, color: C.teal }}
                />
              </div>
            </div>

            {payStatus && (
              <div style={{
                ...styles.payStatus,
                textAlign,
                ...(payStatus.type === "error"
                  ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
                  : payStatus.type === "success"
                    ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
                    : {})
              }}>
                {(payStatus.type === "loading" || payStatus.type === "confirming") && (
                  <span className="spinner" style={{ verticalAlign: "middle", marginInlineEnd: 8 }} />
                )}
                {payStatus.text}
              </div>
            )}

            <button onClick={handlePaymentActivation} disabled={payLoading} className="btn btn-purple btn-block" style={{ marginTop: 20, padding: "16px" }}>
              {payLoading ? t("app.payBtnLoading") : t("app.payBtn")}
            </button>
            <button
              onClick={handleResumeActivation}
              disabled={payLoading}
              className="btn btn-block"
              style={{ marginTop: 10, padding: "12px", fontSize: 12, background: "rgba(124,92,255,0.08)", border: "1px dashed rgba(124,92,255,0.45)", color: "#b3a1ff" }}
            >
              {t("app.resumePayBtn")}
            </button>
            <p style={{ ...T2.hint, marginTop: 14 }}>{t("app.payHint")}</p>
          </div>
        </div>
      ) : (
        <>
          <main ref={(el) => { mainRef.current = el; }} style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", minWidth: 0, minHeight: 0, paddingBottom: "calc(104px + var(--safe-area-inset-bottom, 0px))" }}>
            <div key={activeTab} className="animate-fade-up" style={{ minWidth: 0, width: "100%" }}>
              {activeTab === "home" && <HomePage userId={session.userId} token={session.jwtToken || ""} onNavigateTab={navigateTab} />}
              {activeTab === "airdrop" && <AirdropPage userId={session.userId} token={session.jwtToken || ""} />}
              {activeTab === "referral" && <ReferralPage userId={session.userId} token={session.jwtToken || ""} />}
              {activeTab === "tasks" && <TasksPage userId={session.userId} token={session.jwtToken || ""} />}
              {activeTab === "bonus" && <BonusPage userId={session.userId} token={session.jwtToken || ""} />}
              {/* 👑 تبويب المدير: لا يُتاح إلا لصاحب محفظة المدير حصراً — أي مستخدم آخر يفتح ?tab=admin يُوجَّه فوراً لصفحة 404 */}
              {activeTab === "admin" && (
                session.walletAddress === ADMIN_WALLET
                  ? <AdminPanelPage token={session.jwtToken || ""} />
                  : <NotFoundPage onNavigateTab={navigateTab} />
              )}
              {activeTab === "levels" && <LevelsPage userId={session.userId} token={session.jwtToken || ""} />}
              {/* 🚫 تبويب غير معروف → صفحة 404 آمنة */}
              {!["home", "airdrop", "referral", "tasks", "bonus", "admin", "levels"].includes(activeTab) && (
                <NotFoundPage onNavigateTab={navigateTab} />
              )}
            </div>
          </main>

          <nav className="app-nav" style={styles.nav}>
            {tabs.map((tb) => {
              const active = activeTab === tb.key;
              return (
                <button
                  key={tb.key}
                   onClick={() => navigateTab(tb.key)}
                  className="app-navItem"
                  style={{
                    ...styles.navItem,
                    color: active ? C.teal : C.muted,
                    ...(active ? { background: "rgba(0,255,204,0.1)", borderTop: "2px solid " + C.teal } : {})
                  }}
                >
                  <span className="app-navIcon" style={styles.navIcon}>{tb.icon}</span>
                  <span className="app-navLabel" style={styles.navLabel}>{t(`nav.${tb.key}`)}</span>
                </button>
              );
            })}
          </nav>

          {pull > 0 && (
            <div style={{
              position: "fixed",
              left: "50%",
              transform: "translateX(-50%)",
              top: Math.max(8, Math.min(pull, 110) - 58),
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "9px 16px",
              borderRadius: 999,
              background: "rgba(10,15,30,0.94)",
              border: "1px solid rgba(0,255,204,0.3)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.5)",
              fontSize: 12.5,
              color: C.text,
              fontWeight: 800,
              transition: "top .08s linear",
              whiteSpace: "nowrap",
            }}>
              {refreshing ? (
                <>
                  <span className="spinner" style={{ borderTopColor: "#00ffcc" }} />
                  {t("app.refreshingHint")}
                </>
              ) : (
                <>
                  <span style={{
                    display: "inline-block",
                    fontSize: 15,
                    lineHeight: 1,
                    color: pull >= 64 ? C.teal : C.muted,
                    transform: `rotate(${Math.min(180, (pull / 64) * 180)}deg)`,
                    transition: "transform .12s ease",
                  }}>↓</span>
                  <span style={{ color: pull >= 64 ? C.teal : C.text }}>{pull >= 64 ? t("app.releaseHint") : t("app.pullHint")}</span>
                </>
              )}
            </div>
          )}
          {isNativeApp && !splash && (
            <button
              onClick={() => {
                if (nativeRefreshing) return;
                setNativeRefreshing(true);
                try { sessionStorage.setItem("solkit_skip_splash", "1"); } catch { /* تجاهل */ }
                setTimeout(() => window.location.reload(), 120);
              }}
              style={styles.refreshBtn}
              aria-label={t("app.pullHint")}
              title={t("app.pullHint")}
            >
              {nativeRefreshing ? <span className="spinner" style={{ borderTopColor: "#00ffcc", width: 20, height: 20, borderWidth: 2.5 }} /> : "↻"}
            </button>
          )}
        </>
      )}
      {splash && <SplashOverlay />}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  app: { display: "flex", flexDirection: "column", overflow: "hidden", color: C.text, fontFamily: font, direction: "rtl" },
  // 🔄 زر تحديث داخل تطبيق أندرويد فقط (بديلُ سحب تحديث وهو ما يعطّل في WebView)
  refreshBtn: {
    position: "fixed",
    insetInlineEnd: 18,
    bottom: "calc(88px + var(--safe-area-inset-bottom, 0px))",
    zIndex: 220,
    width: 54,
    height: 54,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,255,204,0.14)",
    border: "1.5px solid rgba(0,255,204,0.55)",
    boxShadow: "0 8px 22px rgba(0,0,0,0.45), 0 0 18px rgba(0,255,204,0.25)",
    color: C.teal,
    fontSize: 24,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: font,
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
    paddingBottom: 14,
    paddingLeft: 20,
    paddingRight: 20,
    background: "rgba(7,11,22,0.75)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)"
  },
  logo: { display: "flex", alignItems: "center", gap: 8 },
  logoTag: {
    fontSize: 10,
    fontWeight: 800,
    color: C.muted,
    letterSpacing: 1,
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "2px 6px",
    borderRadius: 6
  },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  langWrap: { position: "relative" },
  langBtn: { padding: "8px 12px", fontSize: 13 },
  langMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    minWidth: 168,
    background: "rgba(13,19,38,0.97)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
    zIndex: 200,
    backdropFilter: "blur(14px)",
  },
  langItem: {
    background: "transparent",
    border: "none",
    color: C.text,
    fontFamily: font,
    fontSize: 13,
    padding: "9px 12px",
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "right",
    transition: "background .15s ease",
  },
  langSoon: { color: C.faint, fontSize: 10.5, textAlign: "center", padding: "8px 4px 2px", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4 },
  payWrap: { flex: 1, display: "flex", overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "30px 18px calc(30px + var(--safe-area-inset-bottom, 0px))" },
  payCard: { maxWidth: 480, width: "100%", padding: 30, textAlign: "center", margin: "auto" },
  payTitle: { fontSize: 22, fontWeight: 900, color: C.amber, marginTop: 16, marginBottom: 8 },
  payDesc: { color: C.muted, fontSize: 14, lineHeight: 1.8, marginBottom: 20 },
  splitBox: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    textAlign: "right"
  },
  splitRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 },
  refCodeRow: { display: "flex", gap: 10 },
  feeWhy: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 1.8,
    color: C.faint,
    background: "rgba(255,170,0,0.06)",
    border: "1px dashed rgba(255,170,0,0.25)",
    borderRadius: 10,
    padding: "10px 12px"
  },
  payStatus: {
    marginTop: 16,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,255,204,0.25)",
    background: "rgba(0,255,204,0.08)",
    color: C.teal,
    fontSize: 13,
    lineHeight: 1.7,
    textAlign: "right"
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "calc(72px + var(--safe-area-inset-bottom, 0px))",
    paddingBottom: "var(--safe-area-inset-bottom, 0px)",
    display: "flex",
    background: "rgba(10,15,30,0.85)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    zIndex: 100
  },
  navItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: font,
    fontWeight: 700,
    fontSize: 11,
    transition: "color .2s ease, background .2s ease"
  },
  navIcon: { fontSize: 20, transition: "transform .2s ease" },
  navLabel: { fontSize: 11, fontWeight: 700 }
};

// 💫 شاشة تحميل التطبيق — تظهر 3 ثوانٍ عند كل زيارة فوق كل المحتوى
function SplashOverlay() {
  const { t } = useLang();
  const { branding } = useBranding();
  return (
    <div className="splash" dir="rtl" style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background:
        "radial-gradient(560px 380px at 85% -10%, rgba(0,255,204,0.12), transparent 60%)," +
        "radial-gradient(620px 460px at -10% 110%, rgba(124,92,255,0.16), transparent 60%)," +
        "radial-gradient(480px 380px at 50% 130%, rgba(0,184,255,0.09), transparent 60%)," +
        "#070b16",
      overflow: "hidden", touchAction: "none", paddingBottom: "var(--safe-area-inset-bottom, 0px)"
    }}>
      <div className="splash-ring" style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 126, height: 126, borderRadius: "50%",
        background: "rgba(0,255,204,0.06)", border: "1px solid rgba(0,255,204,0.18)"
      }}>
        <div className="floaty" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CoinIcon size={74} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24 }}>
        <span style={{ fontSize: 15, color: "#00ffcc", fontWeight: "bold" }}>⟠</span>
        <span className="gradient-text" style={{ fontSize: 30, fontWeight: 900, letterSpacing: 1 }}>{branding.projectName || "SOLKIT"}</span>
        <span style={{ fontSize: 15, color: "#00ffcc", fontWeight: "bold" }}>⟠</span>
      </div>

      <div className="splash-bar">
        <div className="splash-barFill" />
      </div>

      <div className="splash-tag" style={{ marginTop: 14, color: "#8b93ab", fontSize: 12, fontWeight: 700 }}>
        {t("app.splashLoading")}
      </div>
    </div>
  );
}
