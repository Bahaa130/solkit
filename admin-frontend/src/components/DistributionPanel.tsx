import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";

interface DistributionPanelProps {
  token: string;
}

const MAX_PER_TX = 20; // حد عدد المستلمين في المعاملة الواحدة (حد حجم البايتات)

// 🔁 تأكيد "أفضل جهد" لا يرمي أبداً خطأ انتهاء الارتفاع (block height exceeded):
// العقد العامة (كـ devnet) تتذبذب في رصد الحالات — مهما حدث نعود true ونُحيل
// الحكم النهائي على السيرفر (إعادة محاولة getTransaction ثم فحص رصيد المستلم).
const waitForConfirmation = async (connection: Connection, signature: string, maxWaitMs = 16000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
      if (value) {
        if (value.err) return false; // بُثّت لكنها فشلت فعلاً على السلسلة
        const cs = value.confirmationStatus;
        if (cs === "confirmed" || cs === "finalized") return true;
      }
    } catch { /* خطأ عابر في RPC → أعد المحاولة */ }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return true; // انتهت المهلة دون رصد — لا نمنع المتابعة، السيرفر هو المرجع
};

export default function DistributionPanel({ token }: DistributionPanelProps) {
  const [overview, setOverview] = useState<any>(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [distributing, setDistributing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);
  const [percentage, setPercentage] = useState<number>(100);
  const { t } = useLang();

  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  const fetchAll = async () => {
    try {
      const [ov, hs] = await Promise.all([
        apiFetch("/api/users/admin/distribution/overview", { headers }).then((r) => r.json()),
        apiFetch("/api/users/admin/distribution/history", { headers }).then((r) => r.json()),
      ]);
      setOverview(ov);
      setHistory(Array.isArray(hs) ? hs : []);
    } catch {
      setStatus({ type: "error", text: "تعذر جلب بيانات توزيع الجوائز" });
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // تجهيز التوزيع (معاينة الحصص قبل التنفيذ)
  const prepare = async () => {
    try {
      setPreparing(true);
      setStatus(null);
      setPreview(null);
      const res = await apiFetch(`/api/users/admin/distribution/prepare?percentage=${percentage}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setPreview(data);
         setStatus({ type: "success", text: `تم تجهيز التوزيع: ${data.recipientCount} مشترك سيستلم ${Number(data.pool).toFixed(3)} توكن (${data.requestedPercentage}%) من رصيد المجمع 🎁` });
      } else {
        setStatus({ type: "error", text: data.message || "فشل تجهيز التوزيع" });
      }
    } catch {
      setStatus({ type: "error", text: "خطأ في الاتصال بالخادم" });
    } finally {
      setPreparing(false);
    }
  };

  // تنفيذ التوزيع: بناء المعاملات وتوقيعها عبر Phantom ثم تأكيدها بلوكشينياً
  const distributeNow = async () => {
    if (!preview || !preview.recipients?.length) return;
    const provider = (window as any).solana;
    if (!provider || !provider.isPhantom) {
      return setStatus({ type: "error", text: "الرجاء ربط محفظة المدير (Phantom) أولاً!" });
    }

    try {
      setDistributing(true);
      setStatus({ type: "loading", text: "جاري بناء معاملات توزيع التوكن..." });

      const rpc = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || "https://api.devnet.solana.com";
      const connection = new Connection(rpc, "confirmed");
      const mint = new PublicKey(preview.mint);
      const treasury = new PublicKey(preview.treasuryWallet);
      const treasuryAta = await getAssociatedTokenAddress(mint, treasury);
      const providerPubkey = new PublicKey(provider.publicKey.toString());

      if (providerPubkey.toBase58() !== preview.treasuryWallet) {
        return setStatus({ type: "error", text: "المحفظة المتصلة ليست محفظة الخزانة (المدير)!" });
      }

      const decimals = preview.decimals;
      // تقسيم المستلمين لدفعات ضمن حد حجم المعاملة
      const batches: any[][] = [];
      const all = [...preview.recipients];
      for (let i = 0; i < all.length; i += MAX_PER_TX) batches.push(all.slice(i, i + MAX_PER_TX));

      const results: { recipient: any; txSignature: string }[] = [];

      for (let b = 0; b < batches.length; b++) {
        const group = batches[b];
        const tx = new Transaction();
        for (const r of group) {
          const recipientPubkey = new PublicKey(r.walletAddress);
          const ata = await getAssociatedTokenAddress(mint, recipientPubkey);
          if (!r.hasAta) {
            tx.add(createAssociatedTokenAccountInstruction(providerPubkey, ata, recipientPubkey, mint));
          }
          tx.add(
            createTransferCheckedInstruction(
              treasuryAta,
              mint,
              ata,
              providerPubkey,
              BigInt(Math.round(r.amount * 10 ** decimals)),
              decimals
            )
          );
        }
        tx.feePayer = providerPubkey;
        const blockhash = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash.blockhash;

        setStatus({ type: "loading", text: `⏳ دفعة ${b + 1}/${batches.length} — افتح Phantom لتوقيع إرسال التوكن...` });
        const signed = await provider.signAndSendTransaction(tx);
        const sig = typeof signed === "string" ? signed : signed?.signature;
        if (!sig) throw new Error("لم يُرجع Phantom توقيع المعاملة");

        // 🔁 تأكيد محلي "أفضل جهد" — لا يُرمى خطأ انتهاء الارتفاع (block height exceeded):
        // العقد العامة تتذبذب في الرصد، والقراءة القاطعة تبقى في السيرفر
        // (إعادة محاولة getTransaction ثم فحص رصيد حساب المستلم الحالي).
        await waitForConfirmation(connection, sig);
        group.forEach((r) => results.push({ recipient: r, txSignature: sig }));
      }

      setStatus({ type: "loading", text: "جاري التحقق البلوكشيني وتسجيل التوزيع على السيرفر..." });
      const confirmRes = await apiFetch("/api/users/admin/distribution/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipients: results.map((r) => ({
            userId: r.recipient.userId,
            walletAddress: r.recipient.walletAddress,
            level: r.recipient.level,
            amount: r.recipient.amount,
            txSignature: r.txSignature,
          })),
        }),
      });
      const confirmData = await confirmRes.json();
      if (confirmRes.ok) {
        setStatus({ type: "success", text: confirmData.message });
        setPreview(null);
        fetchAll();
      } else {
        setStatus({ type: "error", text: confirmData.message || "فشل تأكيد التوزيع" });
      }
    } catch (e: any) {
      console.error("Distribution error:", e);
      const msg = e?.message || "";
      // 🧭 خطأ "انتهاء صلاحية الارتفاع" شائع بسبب تذبذب عقد devnet — نترجمه برسالة
      // عربية واضحة ونطمئن: الأموال محفوظة والتوثي النهائي يتم بالسيرفر عند المحاولة التالية.
      if (/expired|block height exceeded/i.test(msg)) {
        setStatus({
          type: "error",
          text: "بُثّت معاملات التوزيع لكن تأكيد البلوكشين لم يُرصد فوراً (تذبذب عقد الشبكة). الأموال محفوظة بأمان — أعد الضغط على «تنفيذ التوزيع» وسيتحقق السيرفر من الاستلام ويسجّل الجوائز دون تكرار."
        });
      } else {
        setStatus({ type: "error", text: msg || "فشل توزيع الجوائز على البلوكشين" });
      }
    } finally {
      setDistributing(false);
    }
  };

  if (!overview) {
    return <div style={{ ...styles.container, textAlign: "center", color: C.muted }}>جاري جلب بيانات توزيع الجوائز...</div>;
  }

  const statCards = [
    { label: "رصيد المجمع الداخلي (المهام/التعدين)", value: Number(overview.accruedBalance || 0).toFixed(3), unit: "توكن", color: C.amber, icon: "💰" },
    { label: "أصحاب أرصدة المجمع", value: `${overview.poolUsers || 0}`, unit: "مشترك", color: C.text, icon: "👥" },
    { label: "توكن الخزانة (البلوكشين)", value: Number(overview.treasuryBalance || 0).toFixed(3), unit: "توكن", color: C.teal, icon: "🏦" },
    { label: "حالة التوكن", value: overview.configured ? "مُفعّل 🟢" : "غير مُعدّ ⚠️", unit: "", color: overview.configured ? C.green : C.red, icon: "🪙" },
  ];

  const statusStyle: React.CSSProperties = status?.type === "error"
    ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
    : status?.type === "success"
      ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
      : { background: "rgba(0,255,204,0.08)", borderColor: "rgba(0,255,204,0.25)", color: C.teal };

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>🎁 توزيع رصيد المجمع الداخلي (يدوي)</h1>
        <p style={styles.subtitle}>يوزَّع رصيد المجمع المتراكم من المهام والتعدين والألعاب والبونص على كل مشترك بنسبة مساهمته، وعند التنفيذ تُصفَّر الأرصدة مع الحفاظ على مستوى الحساب والخبرة — تمهيداً لميزات التجميع والتوزيع المستقبلية.</p>
      </div>

      {!overview.configured && (
        <div className="glass" style={{ ...styles.notice, border: "1px solid rgba(255,176,32,0.3)", background: "rgba(255,176,32,0.06)" }}>
          <strong style={{ color: C.amber }}>⚠️ التوكن غير مُعدّ بعد:</strong>
          <span style={{ color: C.muted, fontSize: 13 }}>
            {" "}{t("distribution.tokenHint")}
          </span>
        </div>
      )}

      <div style={styles.statsGrid}>
        {statCards.map((s, i) => (
          <div key={i} className="glass" style={styles.statCard}>
            <span style={{ fontSize: 22, display: "block", marginBottom: 8 }}>{s.icon}</span>
            <span style={styles.statLabel}>{s.label}</span>
            <h2 style={{ ...styles.statValue, color: s.color }}>
              {s.value} {s.unit && <span style={{ fontSize: 11, fontWeight: 700 }}>{s.unit}</span>}
            </h2>
          </div>
        ))}
      </div>

      {/* مصادر رصيد المجمع */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>مصادر رصيد المجمع (منذ الانطلاق)</h3>
        <div style={styles.sourceGrid}>
          {[
            { label: "التعدين", value: Number(overview.poolSources?.mining || 0).toFixed(3), color: C.teal, icon: "⛏️" },
            { label: "المهام", value: Number(overview.poolSources?.tasks || 0).toFixed(3), color: C.purple, icon: "✅" },
            { label: "الألعاب", value: Number(overview.poolSources?.games || 0).toFixed(3), color: C.amber, icon: "🎮" },
            { label: "البونص اليومي", value: Number(overview.poolSources?.bonus || 0).toFixed(3), color: C.green, icon: "🎁" },
          ].map((s) => (
            <div key={s.label} style={styles.sourceItem}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={styles.sourceLabel}>{s.label}</span>
              <span style={{ ...styles.sourceValue, color: s.color }}>{s.value} <small style={{ fontSize: 10 }}>توكن</small></span>
            </div>
          ))}
        </div>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 12, lineHeight: 1.8 }}>
          تُجمع الأرباح داخلياً في رصيد كل مشترك، وعند التنفيذ يُوزَّع المجمع بنسبة مساهمة كل مشترك (رصيده) مع <strong style={{ color: C.amber }}>تصفير الأرصدة</strong> والحفاظ على المستوى والخبرة وتقدّم الألعاب. خطط التوزيع بالمستويات محفوظة لاستخدامها في ميزات التجميع والتوزيع المستقبلية.
        </p>
      </div>

      {/* زر التوزيع والمعاينة */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>تنفيذ التوزيع اليدوي</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <label style={{ color: C.muted, fontSize: 13, fontWeight: 700 }}>{t("distribution.percentLabel")}</label>
          <input
            type="number"
            min={1}
            max={100}
            value={percentage}
            onChange={(e) => setPercentage(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            style={{ width: 90, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 12px", fontSize: 14, color: C.text, outline: "none", textAlign: "center" }}
          />
          <span style={{ color: C.muted, fontSize: 12 }}>%</span>
          <span style={{ color: C.faint, fontSize: 11, flex: 1, minWidth: 150, textAlign: "right" }}>
            {t("distribution.percentHint")}
          </span>
        </div>
        <button onClick={prepare} disabled={preparing || distributing} className="btn btn-amber btn-block" style={{ padding: 15 }}>
          {preparing ? "جاري تجهيز الحصص..." : "تجهيز توزيع رصيد المجمع (معاينة قبل الإرسال) 🎯"}
        </button>

        {preview && preview.recipients?.length > 0 && (
          <>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.thRow}>
                    <th style={styles.th}>المحفظة المستلمة</th>
                    <th style={styles.th}>المستوى</th>
                    <th style={styles.th}>رصيده الحالي</th>
                    <th style={styles.th}>الحصة %</th>
                    <th style={styles.th}>سيستلم (توكن)</th>
                    <th style={styles.th}>حالة ATA</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.recipients.map((r: any) => (
                    <tr key={r.userId} style={styles.tdRow}>
                      <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 12 }}>
                        {r.walletAddress.substring(0, 6)}...{r.walletAddress.substring(r.walletAddress.length - 6)}
                      </td>
                      <td style={styles.td}>مستوى {r.level}</td>
                      <td style={styles.td}>{Number(r.balance || 0).toFixed(3)}</td>
                      <td style={styles.td}>{(preview.pool ? (r.amount / preview.pool) * 100 : 0).toFixed(1)}%</td>
                      <td style={{ ...styles.td, color: C.teal, fontWeight: 800 }}>{r.amount}</td>
                      <td style={styles.td}>
                        <span className="pill" style={r.hasAta
                          ? { background: "rgba(0,255,119,0.12)", color: "#00ff77", border: "1px solid rgba(0,255,119,0.25)" }
                          : { background: "rgba(255,170,0,0.12)", color: "#ffaa00", border: "1px solid rgba(255,170,0,0.25)" }}>
                          {r.hasAta ? "حساب جاهز ✅" : "سيُنشأ تلقائياً ⚠️"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
              الإجمالي: <strong style={{ color: C.teal }}>{preview.recipients.reduce((s: number, r: any) => s + r.amount, 0)}</strong> توكن من رصيد المجمع —{" "}
              <strong style={{ color: C.amber }}>
                {preview.requestedPercentage && preview.requestedPercentage < 100
                  ? t("distribution.willDeduct")
                  : t("distribution.willZero")}
              </strong>{" "}
              {t("distribution.levelsKept")}
            </p>
            <button onClick={distributeNow} disabled={distributing} className="btn btn-purple btn-block" style={{ padding: 15, marginTop: 12 }}>
              {distributing ? "جاري التوزيع والتوقيع عبر Phantom..." : "توزيع المجمع وتصفير الأرصدة 🚀 (توقيع محفظة المدير)"}
            </button>
          </>
        )}
      </div>

      {/* حالة التنفيذ */}
      {status && (
        <div style={{ ...styles.statusBox, ...statusStyle }}>
          {(status.type === "loading") && <span className="spinner" style={{ verticalAlign: "middle", marginInlineEnd: 8 }} />}
          {status.text}
        </div>
      )}

      {/* سجل التوزيعات */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>سجل دفعات التوزيع السابقة</h3>
        {history.length === 0 ? (
          <p style={{ color: C.muted, textAlign: "center", fontSize: 13, margin: "18px 0" }}>لا توجد أي دفعات توزيع مسجلة بعد.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>التاريخ</th>
                  <th style={styles.th}>الإجمالي (توكن)</th>
                  <th style={styles.th}>المستلمون</th>
                  <th style={styles.th}>التواقيع / Solscan</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} style={styles.tdRow}>
                    <td style={styles.td}>{new Date(b.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td style={{ ...styles.td, color: C.teal, fontWeight: 800 }}>{Number(b.totalTokens).toFixed(3)}</td>
                    <td style={styles.td}>{b.recipientCount} مشترك</td>
                    <td style={styles.td}>
                      {(b.txSignatures || []).map((s: string) => (
                        <a key={s} href={`https://solscan.io/tx/${s}?cluster=devnet`} target="_blank" rel="noreferrer" style={styles.link}>
                          {s.substring(0, 6)}...{s.substring(s.length - 6)} 🔗
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", direction: "rtl", fontFamily: font },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6 },
  notice: { padding: 16, borderRadius: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 },
  statCard: { borderRadius: 18, padding: 20, minWidth: 0, textAlign: "center" },
  statLabel: { color: C.muted, fontSize: 12, display: "block" },
  statValue: { margin: "8px 0 0 0", fontSize: 22, color: C.text, fontWeight: 900 },
  card: { padding: 24 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  sourceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  sourceItem: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", gap: 6 },
  sourceLabel: { color: C.muted, fontSize: 12, fontWeight: 700 },
  sourceValue: { fontSize: 17, fontWeight: 900 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 },
  thRow: { borderBottom: "1px solid rgba(255,255,255,0.12)" },
  th: { color: C.muted, padding: "12px 8px", fontWeight: 700 },
  tdRow: { borderBottom: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "14px 8px", color: C.text },
  link: { color: C.teal, textDecoration: "none", fontWeight: 700, marginInlineEnd: 10 },
  statusBox: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,255,204,0.25)", fontSize: 13, lineHeight: 1.7, textAlign: "right" },
};
