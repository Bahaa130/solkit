import { apiFetch } from "../lib/api";
// src/pages/IcoPage.tsx
// 🏗️ صفحة الاكتتاب والشراء قبل الطرح (ICO / pre-sale) — المحتوى كله يتحكم به المدير
// من لوحة التحكم (السعر، الحدود، السقوف، الجدول الزمني، الأسئلة، الشروط، المزايا).
import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { C, styles as T, font } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useBranding } from "../branding";
import { useSolanaWallet } from "../lib/walletProvider";
import { getNetworkConfig, rpcUrlFor } from "../lib/network";
import { fetchBlockhashWithRetry } from "../lib/blockhash";
import { inspectSolBalance, insufficientSolMessage, estimateFeeLamports, FEE_FALLBACK_LAMPORTS, formatSol as fmtSol } from "../lib/solanaFees";

interface IcoPageProps {
  userId?: number;
  token?: string;
  walletAddress?: string | null;
}

interface IcoConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  priceSOL: number;
  minSOL: number;
  maxSOL: number;
  maxPerWalletSOL: number;
  totalAllocation: number;
  startDate: number;
  endDate: number;
  softCapSOL: number;
  hardCapSOL: number;
  tgePercent: number;
  perks: { icon: string; title: string; desc: string }[];
  faq: { q: string; a: string }[];
  vesting: { label: string; pct: number; when: string }[];
  terms: string;
}

interface IcoStats {
  raisedSOL: number;
  soldTokens: number;
  participants: number;
}

interface PurchaseRow {
  id: number;
  solAmount: number;
  tokenAmount: number;
  status: string;
  txHash: string | null;
  delivered?: boolean;
  createdAt: string;
}

export default function IcoPage({ token, walletAddress }: IcoPageProps) {
  const { dir, t } = useLang();
  const { branding } = useBranding();
  const { address: connectedAddress, connectWallet, sendTransaction } = useSolanaWallet();

  const [config, setConfig] = useState<IcoConfig | null>(null);
  const [stats, setStats] = useState<IcoStats>({ raisedSOL: 0, soldTokens: 0, participants: 0 });
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [treasury, setTreasury] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // ⚠️ تجاوز تحذير الرصيد بعد عرضه مرة واحدة (Phantom هو المرجع النهائي)
  const [skipWarn, setSkipWarn] = useState(false);
  // 💾 دفعة اكتتاب بُثّت ولم يكتمل تسجيلها — نعرض زر استرجاع مثل رسوم التسجيل
  const [pendingTx, setPendingTx] = useState<string | null>(null);
  useEffect(() => {
    try { setPendingTx(localStorage.getItem("solkit_pending_ico_tx")); } catch { /* */ }
  }, []);

  // 🌐 الشبكة (devnet/mainnet-beta) تُقرأ من إعدادات الخادم وليس مجمّدة — كي تطابق
  // شبكة محفظة المستخدم (خلاف ذلك يرفض التوقيع بخطأ "Unexpected error").
  const [rpc, setRpc] = useState<string>(() => rpcUrlFor("devnet"));
  const [network, setNetwork] = useState<string>("devnet");
  const [warmBlockhash, setWarmBlockhash] = useState<{ blockhash: string; lastValidBlockHeight: number; at: number } | null>(null);

  useEffect(() => {
    let alive = true;
    getNetworkConfig()
      .then((cfg) => {
        if (!alive) return;
        setNetwork(cfg.network);
        setRpc(cfg.rpc);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 🔥 إحماء مسبق لبروكسي RPC حتى يكون التوقيع فورياً عند الضغط (نمط لوحة التوزيع)
  useEffect(() => {
    const conn = new Connection(rpc, "confirmed");
    conn.getLatestBlockhash("confirmed")
      .then((bh) => setWarmBlockhash({ ...bh, at: Date.now() }))
      .catch(() => {});
  }, [rpc]);

  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "Authorization": `Bearer ${token || ""}` }),
    [token]
  );

  const load = async () => {
    try {
      const [pubRes, mineRes] = await Promise.all([
        apiFetch("/api/users/ico/public"),
        token ? apiFetch("/api/users/ico/my-purchases", { headers }) : Promise.resolve(null),
      ]);
      const pub = await pubRes.json();
      setConfig(pub.config || null);
      setStats(pub.stats || { raisedSOL: 0, soldTokens: 0, participants: 0 });
      if (mineRes && mineRes.ok) {
        const mine = await mineRes.json();
        setPurchases(mine.purchases || []);
      }
      setLoadErr(null);
    } catch {
      setLoadErr(t("ico.loadError"));
    }
  };

  // 🏦 محفظة الخزانة تأتي من إعدادات المنصة (GET /settings — دون حاجة لمصادقة)
  const loadTreasury = async () => {
    try {
      const res = await apiFetch("/api/users/settings");
      if (res.ok) {
        const s = await res.json();
        setTreasury(s.treasuryWallet || "");
      }
    } catch { /* تبقى فارغة — يُطلب الرابط من /ico/public لاحقاً */ }
  };

  useEffect(() => {
    load();
    loadTreasury();
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // ⏳ العدّاد العكسي حتى نهاية الاكتتاب
  const countdown = useMemo(() => {
    if (!config || !config.endDate) return null;
    const diff = config.endDate - now;
    if (diff <= 0) return { done: true, text: t("ico.ended") };
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { done: false, text: t("ico.countdown", { d, h, m, s }) };
  }, [config, now, t]);

  const remainingTokens = config ? Math.max(0, config.totalAllocation - stats.soldTokens) : 0;
  const soldPct = config && config.totalAllocation > 0 ? Math.min(100, (stats.soldTokens / config.totalAllocation) * 100) : 0;
  const raisedPct = config && config.hardCapSOL > 0 ? Math.min(100, (stats.raisedSOL / config.hardCapSOL) * 100) : 0;
  const windowOpen =
    !!config && config.enabled && (!config.startDate || now >= config.startDate) && (!config.endDate || now <= config.endDate);

  const priceSOL = config?.priceSOL || 0.001;

  const fmt = (n: number, d = 0) =>
    n.toLocaleString(undefined, { maximumFractionDigits: d });

  // 🏷️ حالة عملية اكتتاب: مُسلَّمة 📦 / مؤكّدة ✅ / غير مؤكّدة (بانتظار تأكيد المدير) ⏳
  const purchaseBadge = (p: PurchaseRow) => {
    if (p.delivered) return { label: t("ico.badgeDelivered"), color: "#7cf5c0", bg: "rgba(0,255,204,0.1)", border: "rgba(0,255,204,0.3)" };
    if (p.status === "purchased") return { label: t("ico.badgeConfirmed"), color: "#7cf5c0", bg: "rgba(34,229,132,0.1)", border: "rgba(34,229,132,0.3)" };
    if (p.status === "pending" || !p.status) return { label: t("ico.badgePending"), color: "#ffb020", bg: "rgba(255,176,32,0.1)", border: "rgba(255,176,32,0.3)" };
    return { label: p.status, color: C.muted, bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" };
  };

  const copyAddress = (addr: string) => {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignite */ }
  };

  const amountNum = Number(amountStr);
  const previewTokens = Number.isFinite(amountNum) && amountNum > 0 ? amountNum / priceSOL : 0;

  // 👛 حد المحفظة التراكمي: مشترياتي الحالية + الدفعة الجديدة ≤ maxPerWalletSOL
  const perWalletCap = config?.maxPerWalletSOL ?? 10;
  const myRaised = purchases.reduce((sum, p) => sum + Number(p.solAmount || 0), 0);
  const walletRemaining = Math.max(0, perWalletCap - myRaised);

  // 🛒 إتمام المشاركة: دفع SOL للخزانة ثم اعتماد السيرفر بلوكشينياً
  const purchase = async () => {
    if (!config) return;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return setStatus({ type: "error", text: t("ico.errAmount") });
    }
    if (amountNum < config.minSOL) {
      return setStatus({ type: "error", text: t("ico.errMin", { v: config.minSOL }) });
    }
    if (amountNum > config.maxSOL) {
      return setStatus({ type: "error", text: t("ico.errMax", { v: config.maxSOL }) });
    }
    if (myRaised + amountNum > perWalletCap + 1e-9) {
      return setStatus({ type: "error", text: t("ico.errWalletCap", { cap: perWalletCap, spent: myRaised.toFixed(2), left: walletRemaining.toFixed(2) }) });
    }
    if (previewTokens > remainingTokens) {
      return setStatus({ type: "error", text: t("ico.errRemaining", { v: fmt(remainingTokens) }) });
    }
    if (config.hardCapSOL && stats.raisedSOL + amountNum > config.hardCapSOL) {
      return setStatus({ type: "error", text: t("ico.errHardCap") });
    }

    try {
      setBusy(true);
      setStatus({ type: "loading", text: t("ico.stPreparing") });

      // 🔌 التأكد من اتصال المحفظة — تماماً كدفع رسوم التسجيل: إن لم توجد جلسة
      // نفتح نافذة الربط الحقيقية عبر connectWallet() (الموبايل: رابط Phantom
      // الموحّد، الويب: امتداد Phantom) بدل الاكتفاء بجلسة مخزّنة قد تكون فُقدت.
      let sender = connectedAddress;
      if (!sender) {
        setStatus({ type: "loading", text: t("ico.stConnecting") });
        try { sender = (await connectWallet()) || null; } catch { sender = null; }
      }
      if (!sender) {
        return setStatus({ type: "error", text: t("ico.errConnect") });
      }
      if (walletAddress && sender !== walletAddress) {
        return setStatus({ type: "error", text: t("ico.errWrongWallet") });
      }

      // 🏦 محفظة الخزانة إن لم تصل بعد: من بيانات الاكتتاب العامة؟ نطلبها من /settings مجدداً
      let target = treasury;
      if (!target) {
        try {
          const res = await apiFetch("/api/users/settings");
          const s = await res.json();
          target = s.treasuryWallet || "";
        } catch { target = ""; }
      }
      if (!target) {
        return setStatus({ type: "error", text: t("ico.errNoTreasury") });
      }

      // 🌐 الشبكة تُقرأ من إعدادات الخادم — الدفع يحدث على نفس شبكة محفظة المستخدم
      const netCfg = await getNetworkConfig();
      const rpcUse = netCfg.rpc || rpc;
      const connection = new Connection(rpcUse, "confirmed");
      const lamports = Math.round(amountNum * 1e9);

      // 🔄 آخر blockhash عبر نفس آلية دفع رسوم التسجيل (fetchBlockhashWithRetry):
      // web3 ثلاث مرات ثم fetch مباشر ثلاثاً — نستخدم الإحماء المسبق إن كان حديثاً.
      // ⚠️ الـ blockhash المُحمّى يصير منتهياً بعد ~60-90 ثانية، فنتجاهله إن مضى عليه وقت.
      let latestBlockHashInfo: { blockhash: string; lastValidBlockHeight: number } | null = null;
      try {
        const warmAge = warmBlockhash ? Date.now() - warmBlockhash.at : Infinity;
        const warmFresh = !!warmBlockhash && warmAge < 30_000;
        latestBlockHashInfo = warmFresh
          ? warmBlockhash
          : (await fetchBlockhashWithRetry(
            connection,
            (label, err) => console.warn("[blockhash]", label, err),
            rpcUse,
          ));
      } catch (err) {
        const detail =
          err instanceof Error ? err.message.replace(/^RPC unreachable :: /, "") : "network";
        setStatus({ type: "error", text: t("ico.errNetwork", { rpc: rpcUse, detail }) });
        return;
      }

      // 3. استدعاء المحفظة لتوقيع وبثّ المعاملة (نفس نداء دفع رسوم التسجيل)
      setStatus({ type: "loading", text: t("ico.stSign") });
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(sender),
          toPubkey: new PublicKey(target),
          lamports,
        })
      );
      tx.feePayer = new PublicKey(sender);
      tx.recentBlockhash = latestBlockHashInfo.blockhash;

      // 💰 فحص الرصيد على شبكة الموقع — رسالة بأرقام دقيقة بدل «Insufficient SOL» الغامض.
      // ⚠️ تنبيه لا حظر: إن أخفقت قراءة الرصيد نكمل، و Phantom هو المرجع النهائي.
      if (!skipWarn) {
        try {
          const fee = await estimateFeeLamports(connection, tx);
          const check = await inspectSolBalance(connection, new PublicKey(sender), lamports, fee);
          if (check.readable && !check.ok) {
            setStatus({ type: "error", text: insufficientSolMessage(check, network) });
            setSkipWarn(true);
            return;
          }
          if (check.readable && check.ok && check.cluster && !check.cluster.includes(network)) {
            setStatus({
              type: "error",
              text: t("ico.errCluster", { cluster: check.cluster }),
            });
            setSkipWarn(true);
            return;
          }
        } catch {
          /* تعذّر الفحص — نكمل والمحفظة تتحقق بنفسها */
        }
      }

      const sig = await sendTransaction(tx, connection);
      if (!sig) throw new Error(t("ico.errNoSig"));

      // 💾 تذكّر التوقيع محلياً: إن انقطع التطبيق قبل التسجيل يمكن استرجاع الدفعة
      // لاحقاً دون دفع مزدوج (السيرفر يمسح خزانة الاكتتاب ويجد الدفعة بنفسه).
      try { localStorage.setItem("solkit_pending_ico_tx", sig); setPendingTx(sig); } catch { /* jsdom */ }

      // 🔁 مثل رسوم التسجيل تماماً: تأكيد محلي "أفضل جهد" بمهلة 15 ثانية لا يرمي
      // خطأ انتهاء — تأكيد السيرفر عبر RPC هو المرجع الحقيقي بعد الدفع.
      setStatus({ type: "confirming", text: t("ico.stConfirming") });
      try {
        await Promise.race([
          connection.confirmTransaction({
            signature: sig,
            blockhash: latestBlockHashInfo.blockhash,
            lastValidBlockHeight: latestBlockHashInfo.lastValidBlockHeight,
          }, "confirmed").then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15000)),
        ]);
      } catch (confirmErr) {
        console.warn("Local confirmation skipped (server will re-verify):", confirmErr);
      }

      // 4. إرسال التوقيع للسيرفر لتسجيل المشاركة (يعتمدها فوراً حتى لو تعذّر
      // التحقق الآني — "سُجِّلت ✅ بانتظار تأكيد الإدارة" لا رسالة رفض أبداً)
      setStatus({ type: "loading", text: t("ico.stRegistering") });
      const res = await apiFetch("/api/users/ico/purchase", {
        method: "POST",
        headers,
        body: JSON.stringify({ txHash: sig, solAmount: amountNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        return setStatus({ type: "error", text: data.message || t("ico.errRegister") });
      }
      setStatus({ type: "success", text: data.message || t("ico.stRegistered") });
      setOpen(false);
      setAmountStr("");
      try { localStorage.removeItem("solkit_pending_ico_tx"); setPendingTx(null); } catch { /* */ }
      load();
    } catch (err: any) {
      console.error("ICO purchase error:", err);
      let msg = err?.message || "";
      if (/Failed to fetch|NetworkError|load failed|No data received|ERR_/i.test(msg)) {
        msg = t("ico.errWeakNet");
      }
      setStatus({ type: "error", text: msg });
    } finally {
      setBusy(false);
    }
  };

  // 🔄 استرجاع مشاركة اكتتاب من دفعة سابقة — مثل «استرجاع التفعيل» تماماً:
  // يُرسل بدون txHash والمبلغ، والسيرفر يمسح آخر تحويلات محفظة الخزانة بحثاً عن
  // دفعتك الصادرة من محفظتك ويعتمدها فعلياً — فلا دفع مزدوج أبداً.
  const resumePurchase = async () => {
    if (!token) return;
    try {
      setBusy(true);
      setStatus({ type: "loading", text: t("ico.stSearching") });
      const res = await Promise.race([
        apiFetch("/api/users/ico/purchase", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error(t("ico.stTimeout"))), 25000),
        ),
      ]);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        try { localStorage.removeItem("solkit_pending_ico_tx"); } catch { /* */ }
        setPendingTx(null);
        setStatus({ type: "success", text: data.message || t("ico.stRegistered") });
        load();
      } else {
        // 🧾 لا دفعة مؤهلة؟ رسالة واضحة بدل الرفض الغامض
        const msg: string = data?.message || "";
        const noPayment = /TxHash|لم يتم العثور|مفتاح المعاملة/i.test(msg);
        setStatus({
          type: "error",
          text: noPayment
            ? t("ico.errNoPayment")
            : (msg || t("ico.errResume")),
        });
      }
    } catch (error: any) {
      console.error("ICO resume error:", error);
      setStatus({ type: "error", text: error?.message || t("ico.errResume") });
    } finally {
      setBusy(false);
    }
  };

  // 🚫 الاكتتاب معطّل أو غير مرئي؟ رسالة واضحة بلا أخطاء
  if (!config) {
    return (
      <div style={{ ...styles.page, direction: dir, fontFamily: font }}>
        <div className="glass" style={{ ...styles.card, textAlign: "center", padding: "48px 24px" }}>
          <div className="floaty" style={{ fontSize: 56 }}>🏦</div>
          <h2 style={{ color: C.text, fontWeight: 900, fontSize: 20, marginTop: 12 }}>{loadErr || t("ico.unavailable")}</h2>
          <p style={{ ...T.hint, marginTop: 8 }}>{t("ico.unavailableHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.page, direction: dir, fontFamily: font }}>
      {/* 🏛️ البطاقة الرئيسية */}
      <div className="glass" style={{ ...styles.card, overflow: "hidden", padding: 0 }}>
        <div style={{ padding: "22px 18px 18px", textAlign: "center", background: "linear-gradient(160deg, rgba(0,255,204,0.10), rgba(124,92,255,0.08))" }}>
          <div className="floaty" style={{ fontSize: 46 }}>🚀</div>
          <h1 className="gradient-text" style={{ fontWeight: 900, fontSize: 23, marginTop: 6 }}>
            {config.title.replace("{token}", branding.tokenName)}
          </h1>
          <p style={{ ...T.hint, marginTop: 6 }}>{config.subtitle.replace("{token}", branding.tokenName)}</p>
          <div className="pill" style={{ marginTop: 12, padding: "6px 14px", border: "1px solid rgba(0,255,204,0.3)", color: C.teal, background: "rgba(0,255,204,0.08)" }}>
            {countdown ? (countdown.done ? countdown.text : t("ico.endsIn", { time: countdown.text })) : t("ico.openUntil")}
          </div>
        </div>

        <div style={{ padding: "18px" }}>
          <p style={{ color: C.text, fontSize: 13.5, lineHeight: 1.9, marginBottom: 16 }}>{config.description.replace("{token}", branding.tokenName)}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>{t("ico.price")}</span>
              <span style={{ fontWeight: 900, color: C.teal, fontSize: 16 }}>{priceSOL.toFixed(6)} SOL</span>
            </div>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>{t("ico.totalAllocation")}</span>
              <span style={{ fontWeight: 900, color: C.text, fontSize: 16 }}>{fmt(config.totalAllocation)}</span>
            </div>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>{t("ico.limits")}</span>
              <span style={{ fontWeight: 900, color: C.text, fontSize: 16 }}>{config.minSOL} – {config.maxSOL} SOL</span>
            </div>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>{t("ico.participants")}</span>
              <span style={{ fontWeight: 900, color: C.amber, fontSize: 16 }}>{fmt(stats.participants)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
              <span>{t("ico.soldLabel")}</span>
              <span style={{ color: C.text, fontWeight: 800 }}>{fmt(stats.soldTokens)} / {fmt(config.totalAllocation)} ({soldPct.toFixed(1)}%)</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${soldPct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#00ffcc,#7c5cff)" }} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
              <span>{t("ico.raisedLabel")}</span>
              <span style={{ color: C.text, fontWeight: 800 }}>{fmt(stats.raisedSOL, 2)} / {fmt(config.hardCapSOL, 2)} SOL ({raisedPct.toFixed(1)}%)</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${raisedPct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#ffb020,#ff5c7a)" }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 11.5, color: C.muted }}>
            <span>{t("ico.softCap", { v: fmt(config.softCapSOL, 2) })}</span>
            <span>{t("ico.tge", { v: config.tgePercent })}</span>
          </div>
          <div className="pill" style={{ marginTop: 10, padding: "8px 12px", border: "1px solid rgba(255,176,32,0.3)", color: "#ffb020", background: "rgba(255,176,32,0.06)", fontSize: 11.5, textAlign: "center" }}>
            {t("ico.walletCap", { v: fmt(perWalletCap, 2) })}
            {purchases.length > 0 && <span style={{ display: "block", marginTop: 3, color: C.text }}>{t("ico.walletSpent", { spent: fmt(myRaised, 2), left: fmt(walletRemaining, 2) })}</span>}
          </div>
        </div>
      </div>

      {/* 🛒 زر المشاركة */}
      <button
        onClick={() => { setStatus(null); setOpen(true); }}
        disabled={!windowOpen || busy}
        className="btn btn-purple btn-block"
        style={{ padding: "16px", fontWeight: 900, fontSize: 15, marginTop: 14 }}
      >
        {windowOpen ? t("ico.ctaOpen") : t("ico.ctaClosed")}
      </button>

      {/* 🔄 استرجاع دفعة سابقة لم تُسجَّل (مثل استرجاع رسوم التسجيل) */}
      {token && pendingTx && (
        <div className="glass" style={{ ...styles.card, marginTop: 12, borderColor: "rgba(255,176,32,0.45)" }}>
          <h3 style={styles.cardTitle}>{t("ico.pendingTitle")}</h3>
          <p style={{ ...T.hint, marginTop: 6, fontSize: 12 }}>
            {t("ico.pendingHint")}
          </p>
          <button
            onClick={resumePurchase}
            disabled={busy}
            className="btn btn-purple btn-block"
            style={{ marginTop: 10, padding: "12px", fontWeight: 900, fontSize: 13 }}
          >
            {busy ? t("ico.resumeBusy") : t("ico.resumeSearch")}
          </button>
        </div>
      )}

      {status && (
        <div style={{ ...styles.statusBox, textAlign: "center", marginTop: 12, ...(status.type === "error"
          ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
          : status.type === "success"
            ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
            : {}) }}>
          {(status.type === "loading" || status.type === "confirming") && <span className="spinner" />}
          {status.text}
        </div>
      )}

      {/* 🎁 المزايا */}
      <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
        <h3 style={styles.cardTitle}>{t("ico.perksTitle")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {config.perks.map((p, i) => (
            <div key={i} style={{ ...styles.perkBox, textAlign: "center" }}>
              <div style={{ fontSize: 26 }}>{p.icon}</div>
              <div style={{ fontWeight: 900, color: C.text, fontSize: 13, marginTop: 6 }}>{p.title}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.7 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 📅 جدول الاستحقاق */}
      <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
        <h3 style={styles.cardTitle}>{t("ico.vestingTitle")}</h3>
        {config.vesting.map((v, i) => (
          <div key={i} style={{ ...styles.splitRow, marginTop: i === 0 ? 10 : 8 }}>
            <span style={{ fontWeight: 800, color: C.text, fontSize: 13 }}>{v.label}</span>
            <span style={{ color: C.muted, fontSize: 12 }}>{v.when}</span>
            <span className="pill" style={{ background: "rgba(124,92,255,0.12)", color: "#b3a1ff", border: "1px solid rgba(124,92,255,0.3)" }}>{v.pct}%</span>
          </div>
        ))}
      </div>

      {/* ❓ الأسئلة الشائعة */}
      <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
        <h3 style={styles.cardTitle}>{t("ico.faqTitle")}</h3>
        {config.faq.map((f, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 10 : 12 }}>
            <div style={{ fontWeight: 800, color: C.teal, fontSize: 13.5 }}>◈ {f.q}</div>
            <p style={{ ...T.hint, marginTop: 5, fontSize: 12.5, lineHeight: 1.8 }}>{f.a}</p>
          </div>
        ))}
      </div>

      {/* 📜 الشروط */}
      <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
        <h3 style={styles.cardTitle}>{t("ico.termsTitle")}</h3>
        <p style={{ ...T.hint, marginTop: 8, fontSize: 12.5, lineHeight: 1.9 }}>{config.terms}</p>
      </div>

      {/* 📄 مشترياتي */}
      {purchases.length > 0 && (
        <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
          <h3 style={styles.cardTitle}>{t("ico.myPurchases")}</h3>
          {purchases.map((p) => (
            <div key={p.id} style={{ ...styles.splitRow, marginTop: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: C.text, fontSize: 13 }}>
                  {t("ico.tokensUnit", { v: fmt(p.tokenAmount) })}
                  {p.txHash && (
                    <button onClick={() => copyAddress(p.txHash!)} style={{ marginInlineStart: 8, fontSize: 10.5, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>
                      {copied ? t("ico.copied") : t("ico.link")}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {new Date(p.createdAt).toLocaleString()} · {fmt(p.solAmount, 4)} SOL
                </div>
              </div>
              <span className="pill" style={{ flexShrink: 0, background: purchaseBadge(p).bg, color: purchaseBadge(p).color, border: `1px solid ${purchaseBadge(p).border}` }}>
                {purchaseBadge(p).label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 🪙 رصيد بالتوكنات يفيدك: أبرز أن الارصدة تُضاف بعد تأكيد الإدارة */}
      <p style={{ ...T.hint, textAlign: "center", marginTop: 12, fontSize: 11.5 }}>
        {t("ico.balanceNote")}
      </p>

      {/* 🪟 نافذة المشاركة */}
      {open && (
        <div style={styles.modalOverlay} onClick={() => !busy && setOpen(false)}>
          <div className="glass" style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...styles.cardTitle, textAlign: "center" }}>{t("ico.modalTitle")}</h3>
            <p style={{ ...T.hint, textAlign: "center", marginTop: 4 }}>{t("ico.modalPrice", { price: `${priceSOL.toFixed(6)} SOL`, min: config.minSOL, max: config.maxSOL })}</p>

            <label style={{ display: "block", marginTop: 14, fontSize: 12, color: C.muted }}>{t("ico.amountLabel")}</label>
            <input
              dir="ltr"
              className="input"
              value={amountStr}
              onChange={(e) => { setAmountStr(e.target.value); setSkipWarn(false); }}
              placeholder={t("ico.amountPlaceholder", { v: config.minSOL })}
              inputMode="decimal"
              style={{ textAlign: "center", fontWeight: 800, color: C.teal, marginTop: 6 }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: C.muted }}>
              <span>{t("ico.youGet")}</span>
              <span style={{ fontWeight: 900, color: C.text }}>{previewTokens > 0 ? t("ico.tokensUnit", { v: fmt(previewTokens, 2) }) : "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: C.muted }}>
              <span>{t("ico.yourCap")}</span>
              <span style={{ fontWeight: 900, color: C.amber }}>{fmt(myRaised, 2)} / {fmt(perWalletCap, 2)} SOL <span style={{ color: C.muted, fontWeight: 600 }}>({t("ico.remaining", { v: fmt(walletRemaining, 2) })})</span></span>
            </div>

            <div style={{ marginTop: 14, fontSize: 11.5, color: C.muted, lineHeight: 1.8 }}>
              {t("ico.sendNotePre")}{" "}
              <strong style={{ color: C.text }}>
                {treasury ? `${treasury.slice(0, 6)}…${treasury.slice(-4)}` : t("ico.treasuryWallet")}
              </strong>{" "}
              {t("ico.sendNotePost")}
              <br />
              {/* 💸 صريح تماماً: ما تكتبه هو المحوَّل، ورسوم الشبكة تُضاف فوقه — حتى لا يظهر
                  خطأ «رصيد غير كافٍ» بسبب فرق ضئيل جداً بين رصيدك والمبلغ المطلوب */}
              <span style={{ color: C.amber }}>
                {t("ico.feeNote", { fee: fmtSol(FEE_FALLBACK_LAMPORTS, 5) })}
              </span>
            </div>
            <div className="pill" style={{ marginTop: 10, padding: "6px 10px", border: "1px solid rgba(0,255,204,0.25)", color: C.teal, background: "rgba(0,255,204,0.06)", fontSize: 11.5, textAlign: "center" }}>
              {t("ico.network", { network: network === "mainnet-beta" ? t("ico.networkMainnet") : t("ico.networkDevnet") })}
            </div>

            {status && (
              <div style={{ ...styles.statusBox, marginTop: 12, textAlign: "center", ...(status.type === "error"
                ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
                : status.type === "success"
                  ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
                  : {}) }}>
                {(status.type === "loading" || status.type === "confirming") && <span className="spinner" />}
                {status.text}
              </div>
            )}

            <button onClick={purchase} disabled={busy} className="btn btn-purple btn-block" style={{ marginTop: 14, padding: "14px", fontWeight: 900 }}>
              {busy ? t("ico.submitBusy") : t("ico.submit")}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-block" style={{ marginTop: 8, padding: "10px", fontSize: 12 }}>
              {t("ico.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 🎨 أنماط خفيفة محلية (متوافقة مع الثيم العام)
const styles: any = {
  page: { maxWidth: 500, margin: "0 auto", padding: "16px", minHeight: "100%" },
  card: { borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" },
  cardTitle: { fontWeight: 900, fontSize: 15.5, color: C.text },
  miniStat: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", padding: "12px 8px", borderRadius: 14 },
  perkBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 10px" },
  splitRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusBox: { borderRadius: 12, padding: "11px 12px", fontSize: 12.5, border: "1px solid transparent", fontWeight: 700, lineHeight: 1.6 },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,8,18,0.7)", backdropFilter: "blur(4px)", padding: "16px" },
  modalCard: {
    width: "min(420px, 92vw)", maxHeight: "82vh", overflowY: "auto", borderRadius: 22,
    padding: "20px 18px", background: "#0c1122", border: "1px solid rgba(124,92,255,0.35)", boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
  },
};