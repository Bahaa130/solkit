// src/components/IcoDistributionPanel.tsx
// 📤 توزيعات الاكتتاب: يعرض المشتريات المؤكَّدة التي لم تُسلَّم بعد (مجموعة لكل محفظة)
// ويوقّع المدير يدوياً إرسال توكنات LOL لمحافظ المشترين (نفس آلية لوحة التوزيع)،
// ثم يتحقق الخادم بلوكشينياً ويعلّم المشتريات كمُسلَّمة لمنع التكرار.
import { apiFetch } from "../lib/api";
import React, { useEffect, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { C } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useSolanaWallet } from "../lib/walletProvider";
import { restorePhantomSession } from "../lib/phantomDeeplink";
import { getNetworkConfig, rpcUrlFor } from "../lib/network";
import { Capacitor } from "@capacitor/core";

interface Props { token: string }

interface Recipient {
  walletAddress: string;
  tokenAmount: number;
  purchaseIds: number[];
}

const MAX_PER_TX = 20;

const waitForConfirmation = async (connection: Connection, signature: string, maxWaitMs = 16000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      if (value) {
        if (value.err) return false;
        const cs = value.confirmationStatus;
        if (cs === "confirmed" || cs === "finalized") return true;
      }
    } catch { /* خطأ عابر → أعد المحاولة */ }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return true;
};

export default function IcoDistributionPanel({ token }: Props) {
  const { dir } = useLang();
  const { address: connectedAddress, connectWallet, sendTransaction } = useSolanaWallet();
  const [pending, setPending] = useState<{ pendingCount: number; skippedInvalid: number; totalTokens: number; recipients: Recipient[] } | null>(null);
  const [mint, setMint] = useState("");
  const [decimals, setDecimals] = useState(9);
  const [treasury, setTreasury] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);

  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  // 🌐 الشبكة تُقرأ من إعدادات الخادم لتطابق شبكة محفظة التوزيع (المدير)
  const [rpc, setRpc] = useState<string>(() => rpcUrlFor("devnet"));
  const [warmBlockhash, setWarmBlockhash] = useState<{ blockhash: string; lastValidBlockHeight: number } | null>(null);

  useEffect(() => {
    let alive = true;
    getNetworkConfig()
      .then((cfg) => { if (alive) setRpc(cfg.rpc); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const conn = new Connection(rpc, "confirmed");
    conn.getLatestBlockhash("confirmed").then(setWarmBlockhash).catch(() => {});
  }, [rpc]);

  const loadPreview = async () => {
    try {
      const [pend, st] = await Promise.all([
        apiFetch("/api/users/admin/ico/pending", { headers }),
        apiFetch("/api/users/settings"),
      ]);
      if (pend.ok) {
        const p = await pend.json();
        setPending(p);
      }
      if (st.ok) {
        const s = await st.json();
        setMint(s.tokenMint || "");
        setDecimals(Number(s.tokenDecimals) || 9);
        setTreasury(s.treasuryWallet || "");
      }
    } catch {
      setStatus({ type: "error", text: "خطأ في جلب طلبات توزيع الاكتتاب" });
    }
  };

  useEffect(() => {
    loadPreview();
    /* eslint-disable-next-line */
  }, []);

  // 📤 تنفيذ التوزيع: بناء معاملات نقل التوكن من خزانة المدير وتوقيعها عبر Phantom
  const distribute = async () => {
    if (!pending || !pending.recipients.length) return;
    if (!mint) {
      return setStatus({ type: "error", text: "عقد التوكن غير مربوط بعد — اربطه من تبويب التوكن أولاً." });
    }

    // 📱 الموبايل: لا تُعرض شاشة ربط محفظة — جلسة التوقيع مستعادة تلقائياً
    let sender = connectedAddress;
    if (!sender && Capacitor.isNativePlatform()) {
      sender = restorePhantomSession();
    } else if (!sender) {
      setStatus({ type: "loading", text: "جاري ربط محفظة التوزيع (Phantom)..." });
      try { sender = await connectWallet(); } catch { sender = null; }
    }
    if (!sender) {
      return setStatus({
        type: "error",
        text: Capacitor.isNativePlatform()
          ? "لا توجد جلسة توقيع محفظة محفوظة على هذا الهاتف — سجّل الدخول بالمحفظة المدير مرة واحدة ثم عد إلى التوزيع."
          : "الرجاء ربط محفظة التوزيع (Phantom) أولاً!",
      });
    }
    if (treasury && sender !== treasury) {
      return setStatus({ type: "error", text: "المحفظة المتصلة ليست محفظة الخزانة (المدير)!" });
    }

    try {
      setBusy(true);
      setStatus({ type: "loading", text: "جاري بناء معاملات توزيع توكنات الاكتتاب..." });

      const connection = new Connection(rpc, "confirmed");
      const mintPub = new PublicKey(mint);
      const treasuryPub = new PublicKey(treasury || sender);
      const treasuryAta = await getAssociatedTokenAddress(mintPub, treasuryPub);
      const providerPubkey = new PublicKey(sender);

      // دمج الأشلاء حسب MAX_PER_TX
      const all = [...pending.recipients];
      const batches: Recipient[][] = [];
      for (let i = 0; i < all.length; i += MAX_PER_TX) batches.push(all.slice(i, i + MAX_PER_TX));

      let latestBlockhash = warmBlockhash;
      if (!latestBlockhash) {
        for (let attempt = 1; attempt <= 6 && !latestBlockhash; attempt++) {
          try {
            if (attempt > 1) setStatus({ type: "loading", text: `إيقاظ الخادم (المحاولة ${attempt}/6)...` });
            latestBlockhash = await connection.getLatestBlockhash("confirmed");
            setWarmBlockhash(latestBlockhash);
          } catch (e) {
            if (attempt >= 6) throw e;
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
      if (!latestBlockhash) throw new Error("لا يمكن قراءة حالة الشبكة الآن — أعد المحاولة.");

      const results: { walletAddress: string; tokenAmount: number; purchaseIds: number[]; txSignature: string }[] = [];

      for (let b = 0; b < batches.length; b++) {
        const group = batches[b];
        const tx = new Transaction();
        for (const r of group) {
          const recipientPubkey = new PublicKey(r.walletAddress);
          const ata = await getAssociatedTokenAddress(mintPub, recipientPubkey);
          if (await hasAta(connection, ata)) {
            tx.add(createTransferCheckedInstruction(treasuryAta, mintPub, ata, providerPubkey, BigInt(Math.round(r.tokenAmount * 10 ** decimals)), decimals));
          } else {
            tx.add(createAssociatedTokenAccountInstruction(providerPubkey, ata, recipientPubkey, mintPub));
            tx.add(createTransferCheckedInstruction(treasuryAta, mintPub, ata, providerPubkey, BigInt(Math.round(r.tokenAmount * 10 ** decimals)), decimals));
          }
        }
        tx.feePayer = providerPubkey;
        tx.recentBlockhash = latestBlockhash.blockhash;

        setStatus({ type: "loading", text: `⏳ دفعة ${b + 1}/${batches.length} — افتح Phantom لتوقيع إرسال التوكن...` });
        const sig = await sendTransaction(tx, connection);
        if (!sig) throw new Error("لم يُرجع Phantom توقيع المعاملة");

        await waitForConfirmation(connection, sig);
        group.forEach((r) => results.push({ ...r, txSignature: sig }));
      }

      setStatus({ type: "loading", text: "جاري التحقق البلوكشيني وتسجيل التوزيع على الخادم..." });
      const res = await apiFetch("/api/users/admin/ico/distribute", {
        method: "POST",
        headers,
        body: JSON.stringify({ deliver: results }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: data.message || "تم توزيع توكنات الاكتتاب ✅" });
        loadPreview();
      } else {
        setStatus({ type: "error", text: data.message || "فشل اعتماد توزيع الاكتتاب" });
      }
    } catch (e: any) {
      console.error("ICO distribution error:", e);
      let msg = e?.message || "";
      if (/Failed to fetch|NetworkError|load failed|No data received|ERR_/i.test(msg)) {
        msg = "شبكة ضعيفة أو الخادم يستيقظ الآن — أعد المحاولة بعد قليل.";
      }
      setStatus({ type: "error", text: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
      <h4 style={{ margin: 0, color: C.teal, fontWeight: 900, fontSize: 14 }}>📤 توزيع توكنات الاكتتاب (يدوي منك)</h4>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
        تعرض هذه القائمة المشتريات المؤكَّدة التي وصلت SOL منها ولم تُسلَّم توكناتها بعد (مجمّعة لكل محفظة).
        اضغط زر التوزيع لتوقيع إرسال توكنات <strong style={{ color: C.text }}>LOL</strong> من محفظتك لمحافظ المشترين.
      </p>

      {pending && pending.pendingCount > 0 ? (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span className="pill" style={{ background: "rgba(124,92,255,0.12)", color: "#b3a1ff", border: "1px solid rgba(124,92,255,0.3)" }}>
              🧾 {pending.pendingCount} عملية معلّقة
            </span>
            <span className="pill" style={{ background: "rgba(0,255,204,0.1)", color: C.teal, border: "1px solid rgba(0,255,204,0.3)" }}>
              🪙 {pending.totalTokens.toLocaleString()} توكن بانتظار التوزيع
            </span>
            <span className="pill" style={{ background: "rgba(255,176,32,0.1)", color: "#ffb020", border: "1px solid rgba(255,176,32,0.3)" }}>
              👛 {pending.recipients.length} محفظة مستفيدة
            </span>
          </div>

          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
            {pending.recipients.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "9px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, direction: "ltr" }}>
                    {r.walletAddress.slice(0, 6)}…{r.walletAddress.slice(-4)}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted }} dir={dir}>{r.purchaseIds.length} عملية شراء</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 900, color: C.teal, whiteSpace: "nowrap" }}>
                  {r.tokenAmount.toLocaleString()} توكن
                </span>
              </div>
            ))}
          </div>

          {pending.skippedInvalid > 0 && (
            <p style={{ color: "#ffb020", fontSize: 11, marginTop: 8 }}>
              ⚠️ استُبعد {pending.skippedInvalid} صفاً بعنوان محفظة غير صالح/تجريبي (لا يُرسل توكن لمحفظة ناقصة).
            </p>
          )}

          <button onClick={distribute} disabled={busy} className="btn btn-purple" style={{ padding: "13px 18px", fontWeight: 900, borderRadius: 12, fontSize: 13.5, marginTop: 12 }}>
            {busy ? "جاري التوزيع..." : "📤 توزيع توكنات الاكتتاب الآن"}
          </button>
        </>
      ) : (
        <div style={{ ...({ marginTop: 10, color: C.muted, fontSize: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" } as React.CSSProperties), textAlign: "center" }}>
          🎉 لا توجد مشتريات معلّقة الآن — كل التوكنات المخصّصة سُلّمت.
        </div>
      )}

      {status && (
        <div style={{
          marginTop: 12, borderRadius: 12, padding: "11px 12px", fontSize: 12.5, border: "1px solid transparent", fontWeight: 700, lineHeight: 1.6,
          ...(status.type === "error"
            ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
            : status.type === "success"
              ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
              : {}),
        }}>
          {(status.type === "loading" || status.type === "confirming") && <span className="spinner" />}
          {status.text}
        </div>
      )}
    </div>
  );
}

// 🔍 فحص وجود حساب توكن مرتبط (ATA) لدى المستلم مسبقاً
const hasAta = async (connection: Connection, ata: PublicKey): Promise<boolean> => {
  try {
    const info = await connection.getAccountInfo(ata);
    return Boolean(info);
  } catch {
    return false;
  }
};