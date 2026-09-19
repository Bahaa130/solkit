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
  const { dir } = useLang();
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
  // 💾 دفعة اكتتاب بُثّت ولم يكتمل تسجيلها — نعرض زر استرجاع مثل رسوم التسجيل
  const [pendingTx, setPendingTx] = useState<string | null>(null);
  useEffect(() => {
    try { setPendingTx(localStorage.getItem("solkit_pending_ico_tx")); } catch { /* */ }
  }, []);

  // 🌐 الشبكة (devnet/mainnet-beta) تُقرأ من إعدادات الخادم وليس مجمّدة — كي تطابق
  // شبكة محفظة المستخدم (خلاف ذلك يرفض التوقيع بخطأ "Unexpected error").
  const [rpc, setRpc] = useState<string>(() => rpcUrlFor("devnet"));
  const [network, setNetwork] = useState<string>("devnet");
  const [warmBlockhash, setWarmBlockhash] = useState<{ blockhash: string; lastValidBlockHeight: number } | null>(null);

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
    conn.getLatestBlockhash("confirmed").then(setWarmBlockhash).catch(() => {});
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
      setLoadErr("تعذّر جلب بيانات الاكتتاب — تأكد من اتصالك بالإنترنت.");
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
    if (diff <= 0) return { done: true, text: "انتهى الاكتتاب 🏁" };
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { done: false, text: `${d} يوم ${h} ساعة ${m} د ${s} ث` };
  }, [config, now]);

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
    if (p.delivered) return { label: "مُسلَّمة 📦", color: "#7cf5c0", bg: "rgba(0,255,204,0.1)", border: "rgba(0,255,204,0.3)" };
    if (p.status === "purchased") return { label: "مؤكّد ✅", color: "#7cf5c0", bg: "rgba(34,229,132,0.1)", border: "rgba(34,229,132,0.3)" };
    if (p.status === "pending" || !p.status) return { label: "بانتظار تأكيد المدير ⏳", color: "#ffb020", bg: "rgba(255,176,32,0.1)", border: "rgba(255,176,32,0.3)" };
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
      return setStatus({ type: "error", text: "أدخل مبلغاً صحيحاً بالـ SOL" });
    }
    if (amountNum < config.minSOL) {
      return setStatus({ type: "error", text: `الحد الأدنى للمشاركة ${config.minSOL} SOL` });
    }
    if (amountNum > config.maxSOL) {
      return setStatus({ type: "error", text: `الحد الأقصى للمشاركة ${config.maxSOL} SOL` });
    }
    if (myRaised + amountNum > perWalletCap + 1e-9) {
      return setStatus({ type: "error", text: `الحد الأقصى لكل محفظة هو ${perWalletCap} SOL — أنفقت ${myRaised.toFixed(2)} SOL والباقي المتبقي ${walletRemaining.toFixed(2)} SOL` });
    }
    if (previewTokens > remainingTokens) {
      return setStatus({ type: "error", text: `المتبقي من مخصصات الاكتتاب ${fmt(remainingTokens)} توكن فقط` });
    }
    if (config.hardCapSOL && stats.raisedSOL + amountNum > config.hardCapSOL) {
      return setStatus({ type: "error", text: "اكتمل الهدف الأقصى للاكتتاب" });
    }

    try {
      setBusy(true);
      setStatus({ type: "loading", text: "جاري تجهيز الدفع..." });

      // 🔌 التأكد من اتصال المحفظة — تماماً كدفع رسوم التسجيل: إن لم توجد جلسة
      // نفتح نافذة الربط الحقيقية عبر connectWallet() (الموبايل: رابط Phantom
      // الموحّد، الويب: امتداد Phantom) بدل الاكتفاء بجلسة مخزّنة قد تكون فُقدت.
      let sender = connectedAddress;
      if (!sender) {
        setStatus({ type: "loading", text: "جاري ربط محفظتك (Phantom) — وافق من النافذة..." });
        try { sender = (await connectWallet()) || null; } catch { sender = null; }
      }
      if (!sender) {
        return setStatus({ type: "error", text: "الرجاء ربط محفظتك (Phantom) أولاً!" });
      }
      if (walletAddress && sender !== walletAddress) {
        return setStatus({ type: "error", text: "المحفظة المتصلة ليست المحفظة المرتبطة بحسابك — استخدم نفس المحفظة التي سجّلت بها الدخول." });
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
        return setStatus({ type: "error", text: "لم تُضبط محفظة الخزانة بعد — تواصل مع الإدارة." });
      }

      // 🌐 الشبكة تُقرأ من إعدادات الخادم — الدفع يحدث على نفس شبكة محفظة المستخدم
      const netCfg = await getNetworkConfig();
      const rpcUse = netCfg.rpc || rpc;
      const connection = new Connection(rpcUse, "confirmed");
      const lamports = Math.round(amountNum * 1e9);

      // 🔄 آخر blockhash عبر نفس آلية دفع رسوم التسجيل (fetchBlockhashWithRetry):
      // web3 ثلاث مرات ثم fetch مباشر ثلاثاً — نستخدم الإحماء المسبق إن وُجد للسرعة.
      let latestBlockHashInfo: { blockhash: string; lastValidBlockHeight: number } | null = null;
      try {
        latestBlockHashInfo = warmBlockhash
          || (await fetchBlockhashWithRetry(
            connection,
            (label, err) => console.warn("[blockhash]", label, err),
            rpcUse,
          ));
      } catch (err) {
        const detail =
          err instanceof Error ? err.message.replace(/^RPC unreachable :: /, "") : "network";
        setStatus({ type: "error", text: `تعذّر قراءة حالة الشبكة [${rpcUse}] (${detail}) — أعد المحاولة بعد قليل.` });
        return;
      }

      // 3. استدعاء المحفظة لتوقيع وبثّ المعاملة (نفس نداء دفع رسوم التسجيل)
      setStatus({ type: "loading", text: "افتح محفظتك لتأكيد وتوقيع دفع الاكتتاب..." });
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(sender),
          toPubkey: new PublicKey(target),
          lamports,
        })
      );
      tx.feePayer = new PublicKey(sender);
      tx.recentBlockhash = latestBlockHashInfo.blockhash;

      const sig = await sendTransaction(tx, connection);
      if (!sig) throw new Error("لم يُرجع Phantom توقيع المعاملة");

      // 💾 تذكّر التوقيع محلياً: إن انقطع التطبيق قبل التسجيل يمكن استرجاع الدفعة
      // لاحقاً دون دفع مزدوج (السيرفر يمسح خزانة الاكتتاب ويجد الدفعة بنفسه).
      try { localStorage.setItem("solkit_pending_ico_tx", sig); setPendingTx(sig); } catch { /* jsdom */ }

      // 🔁 مثل رسوم التسجيل تماماً: تأكيد محلي "أفضل جهد" بمهلة 15 ثانية لا يرمي
      // خطأ انتهاء — تأكيد السيرفر عبر RPC هو المرجع الحقيقي بعد الدفع.
      setStatus({ type: "confirming", text: "جاري تأكيد الدفعة على الشبكة..." });
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
      setStatus({ type: "loading", text: "جاري تسجيل مشاركتك على الخادم..." });
      const res = await apiFetch("/api/users/ico/purchase", {
        method: "POST",
        headers,
        body: JSON.stringify({ txHash: sig, solAmount: amountNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        return setStatus({ type: "error", text: data.message || "فشل اعتماد المشاركة — ستظهر زر الاسترجاع، جرّبه بعد قليل." });
      }
      setStatus({ type: "success", text: data.message || "تم تسجيل المشاركة ✅" });
      setOpen(false);
      setAmountStr("");
      try { localStorage.removeItem("solkit_pending_ico_tx"); setPendingTx(null); } catch { /* */ }
      load();
    } catch (err: any) {
      console.error("ICO purchase error:", err);
      let msg = err?.message || "";
      if (/Failed to fetch|NetworkError|load failed|No data received|ERR_/i.test(msg)) {
        msg = "شبكة ضعيفة أو الخادم يستيقظ الآن — جرّب زر «استرجاع المشاركة السابقة» بعد قليل.";
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
      setStatus({ type: "loading", text: "جاري البحث عن دفعتك السابقة على خزانة الاكتتاب..." });
      const res = await Promise.race([
        apiFetch("/api/users/ico/purchase", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("انتهت مهلة الاتصال بالخادم — أعد المحاولة")), 25000),
        ),
      ]);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        try { localStorage.removeItem("solkit_pending_ico_tx"); } catch { /* */ }
        setPendingTx(null);
        setStatus({ type: "success", text: data.message || "تم تسجيل مشاركتك ✅" });
        load();
      } else {
        // 🧾 لا دفعة مؤهلة؟ رسالة واضحة بدل الرفض الغامض
        const msg: string = data?.message || "";
        const noPayment = /TxHash|لم يتم العثور|مفتاح المعاملة/i.test(msg);
        setStatus({
          type: "error",
          text: noPayment
            ? "لم يجد السيرفر دفعة سابقة لم تُسجَّل — إن دفعت فعلاً فانتظر تأكيد الشبكة ثم أعد المحاولة."
            : (msg || "فشل استرجاع المشاركة — أعد المحاولة"),
        });
      }
    } catch (error: any) {
      console.error("ICO resume error:", error);
      setStatus({ type: "error", text: error?.message || "فشل استرجاع المشاركة — أعد المحاولة" });
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
          <h2 style={{ color: C.text, fontWeight: 900, fontSize: 20, marginTop: 12 }}>{loadErr || "الاكتتاب غير متاح حالياً"}</h2>
          <p style={{ ...T.hint, marginTop: 8 }}>سيُفتح باب المشاركة المبكرة قريباً — ترقّب الإعلانات.</p>
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
            {config.title.replace("{token}", branding.tokenName || "SOLKIT")}
          </h1>
          <p style={{ ...T.hint, marginTop: 6 }}>{config.subtitle.replace("{token}", branding.tokenName || "SOLKIT")}</p>
          <div className="pill" style={{ marginTop: 12, padding: "6px 14px", border: "1px solid rgba(0,255,204,0.3)", color: C.teal, background: "rgba(0,255,204,0.08)" }}>
            {countdown ? (countdown.done ? countdown.text : `⏳ ينتهي خلال: ${countdown.text}`) : "⏳ مفتوح حتى إشعار آخر"}
          </div>
        </div>

        <div style={{ padding: "18px" }}>
          <p style={{ color: C.text, fontSize: 13.5, lineHeight: 1.9, marginBottom: 16 }}>{config.description.replace("{token}", branding.tokenName || "SOLKIT")}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>سعر التوكن</span>
              <span style={{ fontWeight: 900, color: C.teal, fontSize: 16 }}>{priceSOL.toFixed(6)} SOL</span>
            </div>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>إجمالي المخصص</span>
              <span style={{ fontWeight: 900, color: C.text, fontSize: 16 }}>{fmt(config.totalAllocation)}</span>
            </div>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>حدَّي عملية الشراء</span>
              <span style={{ fontWeight: 900, color: C.text, fontSize: 16 }}>{config.minSOL} – {config.maxSOL} SOL</span>
            </div>
            <div className="pill" style={{ ...styles.miniStat, textAlign: "center", display: "block" }}>
              <span style={{ display: "block", fontSize: 11, color: C.muted }}>مشاركون</span>
              <span style={{ fontWeight: 900, color: C.amber, fontSize: 16 }}>{fmt(stats.participants)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
              <span>🎯 مخصصات بيعت</span>
              <span style={{ color: C.text, fontWeight: 800 }}>{fmt(stats.soldTokens)} / {fmt(config.totalAllocation)} ({soldPct.toFixed(1)}%)</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${soldPct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#00ffcc,#7c5cff)" }} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
              <span>💰 المجموع</span>
              <span style={{ color: C.text, fontWeight: 800 }}>{fmt(stats.raisedSOL, 2)} / {fmt(config.hardCapSOL, 2)} SOL ({raisedPct.toFixed(1)}%)</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${raisedPct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#ffb020,#ff5c7a)" }} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 11.5, color: C.muted }}>
            <span>🛡️ الهدف الأدنى: {fmt(config.softCapSOL, 2)} SOL</span>
            <span>🚀 {config.tgePercent}% يُفرج فور الإدراج (TGE)</span>
          </div>
          <div className="pill" style={{ marginTop: 10, padding: "8px 12px", border: "1px solid rgba(255,176,32,0.3)", color: "#ffb020", background: "rgba(255,176,32,0.06)", fontSize: 11.5, textAlign: "center" }}>
            👛 حد المحفظة الكلي: {fmt(perWalletCap, 2)} SOL — لا يمكن لمحفظة واحدة الشراء بأكثر من ذلك إجمالاً
            {purchases.length > 0 && <span style={{ display: "block", marginTop: 3, color: C.text }}>→ أنفقت {fmt(myRaised, 2)} SOL · المتبقي {fmt(walletRemaining, 2)} SOL</span>}
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
        {windowOpen ? "اشترك الآن في الاكتتاب 🚀" : "الاكتتاب غير متاح حالياً"}
      </button>

      {/* 🔄 استرجاع دفعة سابقة لم تُسجَّل (مثل استرجاع رسوم التسجيل) */}
      {token && pendingTx && (
        <div className="glass" style={{ ...styles.card, marginTop: 12, borderColor: "rgba(255,176,32,0.45)" }}>
          <h3 style={styles.cardTitle}>🔄 لديك دفعة اكتتاب لم تُسجَّل بعد</h3>
          <p style={{ ...T.hint, marginTop: 6, fontSize: 12 }}>
            بُثّت دفعتك السابقة على الشبكة لكن انقطع الاتصال قبل اكتمال التسجيل — استرجعها الآن دون دفع مزدوج.
          </p>
          <button
            onClick={resumePurchase}
            disabled={busy}
            className="btn btn-purple btn-block"
            style={{ marginTop: 10, padding: "12px", fontWeight: 900, fontSize: 13 }}
          >
            {busy ? "جاري البحث..." : "🔍 استرجاع المشاركة السابقة"}
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
        <h3 style={styles.cardTitle}>🎁 مزايا المشاركة</h3>
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
        <h3 style={styles.cardTitle}>📅 جدول الإفراج والاستحقاق</h3>
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
        <h3 style={styles.cardTitle}>❓ أسئلة شائعة</h3>
        {config.faq.map((f, i) => (
          <div key={i} style={{ marginTop: i === 0 ? 10 : 12 }}>
            <div style={{ fontWeight: 800, color: C.teal, fontSize: 13.5 }}>◈ {f.q}</div>
            <p style={{ ...T.hint, marginTop: 5, fontSize: 12.5, lineHeight: 1.8 }}>{f.a}</p>
          </div>
        ))}
      </div>

      {/* 📜 الشروط */}
      <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
        <h3 style={styles.cardTitle}>📜 الشروط والأحكام</h3>
        <p style={{ ...T.hint, marginTop: 8, fontSize: 12.5, lineHeight: 1.9 }}>{config.terms}</p>
      </div>

      {/* 📄 مشترياتي */}
      {purchases.length > 0 && (
        <div className="glass" style={{ ...styles.card, marginTop: 14 }}>
          <h3 style={styles.cardTitle}>📄 سجل مشترياتي من الاكتتاب</h3>
          {purchases.map((p) => (
            <div key={p.id} style={{ ...styles.splitRow, marginTop: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: C.text, fontSize: 13 }}>
                  {fmt(p.tokenAmount)} توكن
                  {p.txHash && (
                    <button onClick={() => copyAddress(p.txHash!)} style={{ marginInlineStart: 8, fontSize: 10.5, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>
                      {copied ? "✓ نُسخ" : "🔗 الرابط"}
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
        تُضاف التوكنات إلى رصيد حسابك بعد تأكيد الإدارة لمشاركتك، ثم تُفرج حسب جدول الاستحقاق بعد الإدراج.
      </p>

      {/* 🪟 نافذة المشاركة */}
      {open && (
        <div style={styles.modalOverlay} onClick={() => !busy && setOpen(false)}>
          <div className="glass" style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ ...styles.cardTitle, textAlign: "center" }}>🚀 المشاركة في الاكتتاب</h3>
            <p style={{ ...T.hint, textAlign: "center", marginTop: 4 }}>سعر التوكن: <strong style={{ color: C.teal }}>{priceSOL.toFixed(6)} SOL</strong> — الحد الأدنى {config.minSOL} والحد الأقصى {config.maxSOL} SOL</p>

            <label style={{ display: "block", marginTop: 14, fontSize: 12, color: C.muted }}>مبلغ المشاركة (SOL)</label>
            <input
              dir="ltr"
              className="input"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={`مثال: ${config.minSOL}`}
              inputMode="decimal"
              style={{ textAlign: "center", fontWeight: 800, color: C.teal, marginTop: 6 }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: C.muted }}>
              <span>ستحصل على:</span>
              <span style={{ fontWeight: 900, color: C.text }}>{previewTokens > 0 ? fmt(previewTokens, 2) : "—"} توكن</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: C.muted }}>
              <span>👛 حد محفظتك التراكمي:</span>
              <span style={{ fontWeight: 900, color: C.amber }}>{fmt(myRaised, 2)} / {fmt(perWalletCap, 2)} SOL <span style={{ color: C.muted, fontWeight: 600 }}>(متبقي {fmt(walletRemaining, 2)})</span></span>
            </div>

            <div style={{ marginTop: 14, fontSize: 11.5, color: C.muted, lineHeight: 1.8 }}>
              تُرسل دفعتك إلى <strong style={{ color: C.text }}>{treasury ? `${treasury.slice(0, 6)}…${treasury.slice(-4)}` : "محفظة الخزانة"}</strong> عن طريق محفظتك مباشرة — لا نحتفظ بأموالك في أي وقت.
            </div>
            <div className="pill" style={{ marginTop: 10, padding: "6px 10px", border: "1px solid rgba(0,255,204,0.25)", color: C.teal, background: "rgba(0,255,204,0.06)", fontSize: 11.5, textAlign: "center" }}>
              🌐 الشبكة: {network === "mainnet-beta" ? "الشبكة الحقيقية (Mainnet)" : "شبكة التطوير (Devnet)"} — تأكد أن محفظتك على نفس الشبكة قبل الدفع.
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
              {busy ? "جاري المعالجة..." : "تأكيد المشاركة والدفع"}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="btn btn-block" style={{ marginTop: 8, padding: "10px", fontSize: 12 }}>
              إلغاء
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
  modalOverlay: { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(5,8,18,0.7)", backdropFilter: "blur(4px)", paddingBottom: "24px" },
  modalCard: {
    width: "min(420px, 92vw)", maxHeight: "82vh", overflowY: "auto", borderRadius: 22,
    padding: "20px 18px", background: "#0c1122", border: "1px solid rgba(124,92,255,0.35)", boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
  },
};