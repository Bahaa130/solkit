// src/components/IcoAdminPanel.tsx
// 🏗️ إدارة صفحة الاكتتاب (ICO) بالكامل: المحتوى، السعر، السقوف، الجدول الزمني،
// المزايا، الأسئلة، الاستحقاق، الشروط + سجل مشتريات المشاركين الحيّ.
import { apiFetch } from "../lib/api";
import React, { useEffect, useState } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useToast } from "../components/Toast";
import IcoDistributionPanel from "./IcoDistributionPanel";

interface Perk { icon: string; title: string; desc: string }
interface Faq { q: string; a: string }
interface Vest { label: string; pct: string; when: string }

interface IcoForm {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  priceSOL: string;
  minSOL: string;
  maxSOL: string;
  maxPerWalletSOL: string;
  totalAllocation: string;
  softCapSOL: string;
  hardCapSOL: string;
  tgePercent: string;
  startDate: string;
  endDate: string;
  perks: Perk[];
  faq: Faq[];
  vesting: Vest[];
  terms: string;
}

interface PurchaseRow {
  id: number;
  solAmount: number;
  tokenAmount: number;
  status: string;
  txHash: string | null;
  delivered?: boolean;
  createdAt: string;
  user?: { email?: string; walletAddress?: string | null; name?: string | null };
}

interface Props { token: string }

const tsToLocal = (ts: number) => (ts ? new Date(ts).toISOString().slice(0, 16) : "");
const localToTs = (v: string) => (v ? new Date(v).getTime() : 0);

const emptyForm = (): IcoForm => ({
  enabled: false,
  title: "اكتتاب مشاركة مبكرة 🚀",
  subtitle: "",
  description: "",
  priceSOL: "0.001",
  minSOL: "0.05",
  maxSOL: "10",
  maxPerWalletSOL: "10",
  totalAllocation: "100000",
  softCapSOL: "20",
  hardCapSOL: "100",
  tgePercent: "25",
  startDate: "",
  endDate: "",
  perks: [{ icon: "💎", title: "سعر تفضيلي", desc: "سعر أقل من سعر الإدراج المتوقّع." }],
  faq: [{ q: "متى أستلم توكناتي؟", a: "تُسجَّل مخصصاتك فور تأكيد الدفع وتُفرج وفق جدول الاستحقاق." }],
  vesting: [{ label: "عند الإدراج (TGE)", pct: "25", when: "فوراً" }],
  terms: "",
});

export default function IcoAdminPanel({ token }: Props) {
  const { t } = useLang();
  const toast = useToast();
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  const [form, setForm] = useState<IcoForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [network, setNetwork] = useState<string>("devnet");
  const [platformInfo, setPlatformInfo] = useState<{ tokenMint: string; tokenDecimals: number; treasuryWallet: string }>({ tokenMint: "", tokenDecimals: 9, treasuryWallet: "" });
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [totals, setTotals] = useState({ raisedSOL: 0, soldTokens: 0, count: 0 });

  const load = async () => {
    try {
      const res = await apiFetch("/api/users/settings");
      const d = await res.json();
      if (res.ok) {
        if (d.solanaNetwork === "devnet" || d.solanaNetwork === "mainnet-beta") setNetwork(d.solanaNetwork);
        setPlatformInfo({
          tokenMint: d.tokenMint || "",
          tokenDecimals: Number(d.tokenDecimals) || 9,
          treasuryWallet: d.treasuryWallet || "",
        });
      }
      if (res.ok && d.ico) {
        const ico = d.ico;
        setForm({
          enabled: Boolean(ico.enabled),
          title: String(ico.title || ""),
          subtitle: String(ico.subtitle || ""),
          description: String(ico.description || ""),
          priceSOL: String(ico.priceSOL ?? "0.001"),
          minSOL: String(ico.minSOL ?? "0.05"),
          maxSOL: String(ico.maxSOL ?? "10"),
          maxPerWalletSOL: String(ico.maxPerWalletSOL ?? "10"),
          totalAllocation: String(ico.totalAllocation ?? "100000"),
          softCapSOL: String(ico.softCapSOL ?? "20"),
          hardCapSOL: String(ico.hardCapSOL ?? "100"),
          tgePercent: String(ico.tgePercent ?? "25"),
          startDate: tsToLocal(Number(ico.startDate || 0)),
          endDate: tsToLocal(Number(ico.endDate || 0)),
          perks: Array.isArray(ico.perks) ? ico.perks.map((p: any) => ({ icon: String(p.icon || ""), title: String(p.title || ""), desc: String(p.desc || "") })) : [],
          faq: Array.isArray(ico.faq) ? ico.faq.map((f: any) => ({ q: String(f.q || ""), a: String(f.a || "") })) : [],
          vesting: Array.isArray(ico.vesting) ? ico.vesting.map((v: any) => ({ label: String(v.label || ""), pct: String(v.pct ?? ""), when: String(v.when || "") })) : [],
          terms: String(ico.terms || ""),
        });
      }
    } catch { /* تجاهل */ } finally {
      setLoading(false);
    }
  };

  const loadPurchases = async () => {
    try {
      const res = await apiFetch("/api/users/admin/ico/purchases", { headers });
      const d = await res.json();
      if (res.ok) {
        setPurchases(Array.isArray(d.purchases) ? d.purchases : []);
        setTotals(d.totals || { raisedSOL: 0, soldTokens: 0, count: 0 });
      }
    } catch { /* تجاهل */ }
  };

  useEffect(() => {
    load();
    loadPurchases();
    /* eslint-disable-next-line */
  }, []);

  // ✅ تأكيد يدوي لمشاركة (المدير يتأكد من وصول الدفع ثم يرقّيها)
  const confirmPurchase = async (id: number) => {
    try {
      const res = await apiFetch("/api/users/admin/ico/confirm", {
        method: "POST", headers, body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (res.ok) { toast.success(d.message || "تم التأكيد ✅"); await loadPurchases(); }
      else toast.error(d.message || "فشل التأكيد");
    } catch { toast.error("فشل التأكيد — تحقق من الاتصال"); }
  };

  // ↩️ إعادة عملية إلى حالة «غير مؤكّدة» (تراجع يدوي)
  const unconfirmPurchase = async (id: number) => {
    try {
      const res = await apiFetch("/api/users/admin/ico/unconfirm", {
        method: "POST", headers, body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (res.ok) { toast.success(d.message || "أُعيدت إلى غير مؤكَّدة"); await loadPurchases(); }
      else toast.error(d.message || "فشلت العملية");
    } catch { toast.error("فشلت العملية — تحقق من الاتصال"); }
  };

  // ➕ إضافة اشتراك يدوي (دفع خارجي/نقدي لا يمر بالسلسلة)
  const [manual, setManual] = useState({ email: "", solAmount: "", status: "pending", txHash: "" });
  const addManualPurchase = async () => {
    if (!manual.email.trim() || !Number(manual.solAmount)) {
      toast.error("أدخل بريد المشترك ومبلغ الاشتراك");
      return;
    }
    try {
      const res = await apiFetch("/api/users/admin/ico/add-purchase", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: manual.email.trim(),
          solAmount: Number(manual.solAmount),
          status: manual.status,
          txHash: manual.txHash.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (res.ok) { toast.success(d.message || "تم تسجيل الاشتراك ✅"); setManual({ email: "", solAmount: "", status: "pending", txHash: "" }); await loadPurchases(); }
      else toast.error(d.message || "فشل تسجيل الاشتراك");
    } catch { toast.error("فشل تسجيل الاشتراك — تحقق من الاتصال"); }
  };

  const set = <K extends keyof IcoForm>(key: K, val: IcoForm[K]) => setForm((p) => ({ ...p, [key]: val }));

  const num = (v: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  const save = async () => {
    const price = num(form.priceSOL, 0.001, 1e-9, 1000);
    if (num(form.minSOL, 0.05) > num(form.maxSOL, 10)) {
      toast.error("الحد الأدنى أكبر من الحد الأقصى — راجع القيم");
      return;
    }
    if (price <= 0) {
      toast.error("سعر التوكن يجب أن يكون أكبر من صفر");
      return;
    }
    const ico = {
      enabled: form.enabled,
      title: form.title.trim().slice(0, 120) || "اكتتاب مشاركة مبكرة 🚀",
      subtitle: form.subtitle.trim().slice(0, 300),
      description: form.description.trim().slice(0, 3000),
      priceSOL: price,
      minSOL: num(form.minSOL, 0.05, 0, 100000),
      maxSOL: num(form.maxSOL, 10, 0, 1000000),
      maxPerWalletSOL: num(form.maxPerWalletSOL, 10, 0, 1000000),
      totalAllocation: num(form.totalAllocation, 100000, 0, 10_000_000_000),
      softCapSOL: num(form.softCapSOL, 20, 0, 10_000_000),
      hardCapSOL: num(form.hardCapSOL, 100, 0, 10_000_000),
      tgePercent: num(form.tgePercent, 25, 0, 100),
      startDate: localToTs(form.startDate),
      endDate: localToTs(form.endDate),
      perks: form.perks.map((p) => ({ icon: p.icon.trim().slice(0, 8) || "🎁", title: p.title.trim().slice(0, 120), desc: p.desc.trim().slice(0, 500) })).filter((p) => p.title),
      faq: form.faq.map((f) => ({ q: f.q.trim().slice(0, 400), a: f.a.trim().slice(0, 2000) })).filter((f) => f.q),
      vesting: form.vesting.map((v) => ({ label: v.label.trim().slice(0, 120), pct: num(v.pct, 0, 0, 100), when: v.when.trim().slice(0, 120) })).filter((v) => v.label),
      terms: form.terms.trim().slice(0, 6000),
    };
    try {
      setSaving(true);
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST", headers, body: JSON.stringify({ ico, solanaNetwork: network }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("تم حفظ إعدادات الاكتتاب ✅");
        await loadPurchases();
      } else {
        toast.error(data.message || t("admin.settingsError"));
      }
    } catch {
      toast.error(t("admin.settingsError"));
    } finally {
      setSaving(false);
    }
  };

  const updatePerk = (i: number, key: keyof Perk, val: string) => {
    set("perks", form.perks.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)));
  };
  const updateFaq = (i: number, key: keyof Faq, val: string) => {
    set("faq", form.faq.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)));
  };
  const updateVest = (i: number, key: keyof Vest, val: string) => {
    set("vesting", form.vesting.map((v, idx) => (idx === i ? { ...v, [key]: val } : v)));
  };

  const daysLeft = form.endDate ? Math.max(0, Math.ceil((localToTs(form.endDate) - Date.now()) / 86400000)) : null;

  return (
    <div className="glass" style={styles.card}>
      <h3 style={styles.title}>🏗️ {t("nav.ico")} — صفحة الاكتتاب</h3>
      <p style={styles.sub}>تتحكم بالكامل بمحتوى الصفحة التي يراها المستخدمون والسقوف والسعر وتفعيل المشاركة وسجل المشتريات.</p>

      {loading ? (
        <p style={{ color: C.muted, fontSize: 12 }}>جاري تحميل الإعدادات...</p>
      ) : (
        <>
          {/* ⚙️ التفعيل + العنوان */}
          <label style={styles.toggleRow}>
            <span style={{ color: C.text, fontWeight: 800, fontSize: 13 }}>🔛 تفعيل الاكتتاب وظهوره للمستخدمين</span>
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} style={{ width: 20, height: 20, accentColor: C.amber }} />
          </label>

          <div style={styles.grid2}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>عنوان الصفحة</span>
              <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>الوصف الفرعي</span>
              <input className="input" value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} style={styles.input} />
            </label>
          </div>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>الوصف الكامل</span>
            <textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} style={styles.textarea} />
          </label>

          {/* 💰 الأسعار والحدود */}
          <div style={styles.grid4}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>سعر التوكن (SOL)</span>
              <input className="input" type="number" step="0.000001" value={form.priceSOL} onChange={(e) => set("priceSOL", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>الحد الأدنى (SOL)</span>
              <input className="input" type="number" step="0.01" value={form.minSOL} onChange={(e) => set("minSOL", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>الحد الأقصى للعملية (SOL)</span>
              <input className="input" type="number" step="0.01" value={form.maxSOL} onChange={(e) => set("maxSOL", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>👛 الحد الأقصى لكل محفظة (SOL)</span>
              <input className="input" type="number" step="0.01" value={form.maxPerWalletSOL} onChange={(e) => set("maxPerWalletSOL", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>إجمالي المخصص (توكن)</span>
              <input className="input" type="number" value={form.totalAllocation} onChange={(e) => set("totalAllocation", e.target.value)} style={styles.input} />
            </label>
          </div>

          <div style={styles.grid4}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>الهدف الأدنى (SOL)</span>
              <input className="input" type="number" step="0.1" value={form.softCapSOL} onChange={(e) => set("softCapSOL", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>الهدف الأقصى (SOL)</span>
              <input className="input" type="number" step="0.1" value={form.hardCapSOL} onChange={(e) => set("hardCapSOL", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>الإفراج الفوري % (TGE)</span>
              <input className="input" type="number" max={100} value={form.tgePercent} onChange={(e) => set("tgePercent", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>النهاية ⏳ {daysLeft !== null ? `(بعد ~${daysLeft} يوم)` : "—"}</span>
              <input type="datetime-local" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} style={styles.input} />
            </label>
          </div>

          <div style={styles.grid2}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>البداية (فارغة = فوراً)</span>
              <input type="datetime-local" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} style={styles.input} />
            </label>
          </div>

          {/* 🌐 الشبكة التي يُدفع/يوقَّع عليها الاكتتاب */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>شبكة الدفع (يجب أن تطابق محفظة المشارك)</span>
              <select className="input" value={network} onChange={(e) => setNetwork(e.target.value)} style={styles.input}>
                <option value="devnet">شبكة التطوير (Devnet)</option>
                <option value="mainnet-beta">الشبكة الحقيقية (Mainnet)</option>
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{platformInfo.tokenMint ? "إيصال التوكن المرتبط" : "خزانة الاكتتاب (تصل SOL إليها)"}</span>
              <div className="pill" style={{ ...styles.input, display: "flex", alignItems: "center", gap: 6, direction: "ltr", color: platformInfo.tokenMint ? C.teal : C.amber, fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {platformInfo.tokenMint ? `TOKEN ● ${platformInfo.tokenMint.slice(0, 10)}… (${platformInfo.tokenDecimals})` : `🏦 ${platformInfo.treasuryWallet ? platformInfo.treasuryWallet.slice(0, 12) + "…" : "غير مُضبط"}`}
              </div>
            </label>
          </div>

          {/* 🎁 المزايا */}
          <div style={styles.sectionHead}>
            <h4 style={styles.sectionTitle}>🎁 المزايا</h4>
            <button onClick={() => set("perks", [...form.perks, { icon: "🎁", title: "", desc: "" }])} className="btn" style={styles.addBtn}>+ إضافة ميزة</button>
          </div>
          {form.perks.map((p, i) => (
            <div key={i} style={styles.subRow}>
              <input className="input" value={p.icon} onChange={(e) => updatePerk(i, "icon", e.target.value)} style={{ ...styles.input, width: 52, textAlign: "center" }} maxLength={4} />
              <input className="input" value={p.title} onChange={(e) => updatePerk(i, "title", e.target.value)} placeholder="عنوان الميزة" style={{ ...styles.input, flex: 1 }} />
              <input className="input" value={p.desc} onChange={(e) => updatePerk(i, "desc", e.target.value)} placeholder="شرح قصير" style={{ ...styles.input, flex: 2 }} />
              <button onClick={() => set("perks", form.perks.filter((_, idx) => idx !== i))} className="btn" style={styles.delBtn}>🗑️</button>
            </div>
          ))}

          {/* ❓ الأسئلة */}
          <div style={styles.sectionHead}>
            <h4 style={styles.sectionTitle}>❓ الأسئلة الشائعة</h4>
            <button onClick={() => set("faq", [...form.faq, { q: "", a: "" }])} className="btn" style={styles.addBtn}>+ إضافة سؤال</button>
          </div>
          {form.faq.map((f, i) => (
            <div key={i} style={{ ...styles.subRow, flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="input" value={f.q} onChange={(e) => updateFaq(i, "q", e.target.value)} placeholder="السؤال" style={styles.input} />
                <button onClick={() => set("faq", form.faq.filter((_, idx) => idx !== i))} className="btn" style={styles.delBtn}>🗑️</button>
              </div>
              <textarea rows={2} value={f.a} onChange={(e) => updateFaq(i, "a", e.target.value)} placeholder="الإجابة" style={styles.textarea} />
            </div>
          ))}

          {/* 📅 الاستحقاق */}
          <div style={styles.sectionHead}>
            <h4 style={styles.sectionTitle}>📅 جدول الإفراج/الاستحقاق</h4>
            <button onClick={() => set("vesting", [...form.vesting, { label: "", pct: "25", when: "" }])} className="btn" style={styles.addBtn}>+ إضافة دفعة</button>
          </div>
          {form.vesting.map((v, i) => (
            <div key={i} style={styles.subRow}>
              <input className="input" value={v.label} onChange={(e) => updateVest(i, "label", e.target.value)} placeholder="العنوان (مثال: عند الإدراج)" style={{ ...styles.input, flex: 2 }} />
              <input className="input" value={v.pct} onChange={(e) => updateVest(i, "pct", e.target.value)} placeholder="%" style={{ ...styles.input, width: 64, textAlign: "center" }} />
              <input className="input" value={v.when} onChange={(e) => updateVest(i, "when", e.target.value)} placeholder="متى؟ (مثال: بعد 3 أشهر)" style={{ ...styles.input, flex: 1 }} />
              <button onClick={() => set("vesting", form.vesting.filter((_, idx) => idx !== i))} className="btn" style={styles.delBtn}>🗑️</button>
            </div>
          ))}

          {/* 📜 الشروط */}
          <label style={styles.field}>
            <span style={styles.fieldLabel}>الشروط والأحكام</span>
            <textarea rows={4} value={form.terms} onChange={(e) => set("terms", e.target.value)} style={styles.textarea} />
          </label>

          <div style={styles.actions}>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={styles.saveBtn}>
              {saving ? "جاري الحفظ..." : t("admin.saveBtn")}
            </button>
          </div>
        </>
      )}

      {/* 📊 سجل المشتريات */}
      <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
        <h4 style={{ ...styles.sectionTitle, fontSize: 14 }}>📊 سجل مشتريات المشاركين</h4>
        <p style={{ ...styles.sub, margin: "4px 0 0", lineHeight: 1.7 }}>
          التأكيد يدوي منك: المشاركات تصل «غير مؤكّدة» في الغالب (التحقق البلوكشيني تلقائي لكن قد يتأخر) —
          راجعها أدناه واكبت زر «تأكيد» بعد التحقق من وصول الدفع لتدخل في التوزيع.
        </p>
        <div style={styles.grid3}>
          <div style={styles.statBox}>
            <span style={{ fontSize: 11, color: C.muted }}>مجموع الـ SOL</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.amber }}>{totals.raisedSOL.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div style={styles.statBox}>
            <span style={{ fontSize: 11, color: C.muted }}>توكنات مباعة</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.teal }}>{totals.soldTokens.toLocaleString()}</span>
          </div>
          <div style={styles.statBox}>
            <span style={{ fontSize: 11, color: C.muted }}>عدد العمليات</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.text }}>{totals.count}</span>
          </div>
        </div>

        {/* ➕ إضافة اشتراك يدوي (دفع خارجي/نقدي لا يمر بالسلسلة) */}
        <div style={{ ...styles.subRow, flexDirection: "column", alignItems: "stretch", gap: 8, marginTop: 12, borderColor: "rgba(124,92,255,0.35)", background: "rgba(124,92,255,0.06)" }}>
          <span style={{ color: C.text, fontWeight: 900, fontSize: 12.5 }}>➕ إضافة اشتراك يدوي (دفع خارجي لا يمر بالسلسلة)</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 1fr auto", gap: 8, alignItems: "center" }}>
            <input className="input" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} placeholder="بريد المشترك المسجّل" style={{ ...styles.input, minWidth: 0 }} />
            <input className="input" type="number" step="0.01" value={manual.solAmount} onChange={(e) => setManual({ ...manual, solAmount: e.target.value })} placeholder="المبلغ SOL" style={{ ...styles.input, minWidth: 0 }} />
            <select className="input" value={manual.status} onChange={(e) => setManual({ ...manual, status: e.target.value })} style={styles.input}>
              <option value="pending">غير مؤكّد</option>
              <option value="purchased">مؤكّد مباشرة</option>
            </select>
            <input className="input" value={manual.txHash} onChange={(e) => setManual({ ...manual, txHash: e.target.value })} placeholder="إيصال التحويل (اختياري)" style={{ ...styles.input, minWidth: 0 }} dir="ltr" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={addManualPurchase} className="btn" style={{ ...styles.addBtn, border: "1px solid rgba(124,92,255,0.5)" }}>
              تسجيل الاشتراك
            </button>
          </div>
        </div>

        {purchases.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>لا توجد مشتريات بعد — شارِك رابط الصفحة مع المستخدمين.</p>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {purchases.map((p) => (
              <div key={p.id} style={{ ...styles.subRow, background: "rgba(255,255,255,0.03)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.user?.email || p.user?.name || (p.user?.walletAddress ? `${p.user.walletAddress.slice(0, 6)}…${p.user.walletAddress.slice(-4)}` : "مستخدم")}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{new Date(p.createdAt).toLocaleString()}</div>
                  {p.user?.walletAddress && (
                    <div style={{ fontSize: 9.5, color: C.muted, direction: "ltr", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                      👛 {p.user.walletAddress.slice(0, 12)}…{p.user.walletAddress.slice(-6)}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: "end" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>{p.tokenAmount.toLocaleString()} توكن</div>
                  <div style={{ fontSize: 10.5, color: C.amber }}>{p.solAmount} SOL</div>
                </div>
                <span className="pill" style={{ flexShrink: 0, fontSize: 10.5, background: p.delivered ? "rgba(0,255,204,0.1)" : p.status === "purchased" ? "rgba(34,229,132,0.1)" : "rgba(255,176,32,0.1)", color: p.delivered ? "#7cf5c0" : p.status === "purchased" ? "#7cf5c0" : "#ffb020", border: `1px solid ${p.delivered || p.status === "purchased" ? "rgba(34,229,132,0.35)" : "rgba(255,176,32,0.35)"}` }}>
                  {p.delivered ? "مُسلَّمة 📦" : p.status === "purchased" ? "مؤكّد ✅" : p.status === "pending" ? "غير مؤكّد ⏳" : p.status}
                </span>
                <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
                  {p.status === "pending" && !p.delivered && (
                    <button onClick={() => confirmPurchase(p.id)} className="btn" style={{ ...styles.confirmBtn, whiteSpace: "nowrap" }}>تأكيد ✅</button>
                  )}
                  {p.status === "purchased" && !p.delivered && (
                    <button onClick={() => unconfirmPurchase(p.id)} className="btn" style={{ ...styles.unconfirmBtn, whiteSpace: "nowrap" }}>غير مؤكّد</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 📤 توزيع توكنات الاكتتاب يدوياً من المدير */}
      <IcoDistributionPanel token={token} />
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  card: { borderRadius: 18, padding: "20px 18px", fontFamily: font },
  title: { margin: "0 0 6px", fontSize: 16, fontWeight: 900, color: C.text },
  sub: { margin: "0 0 16px", color: C.muted, fontSize: 12, lineHeight: 1.8 },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "10px 12px", marginBottom: 12 },
  field: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 },
  fieldLabel: { color: C.muted, fontSize: 10.5, fontWeight: 700 },
  input: { background: "rgba(7,11,22,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: C.text, fontFamily: font, fontSize: 12.5, padding: "9px 10px", outline: "none", minWidth: 0 },
  textarea: { ...({ background: "rgba(7,11,22,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: C.text, fontFamily: font, fontSize: 12.5, padding: "9px 10px", outline: "none", minWidth: 0 } as React.CSSProperties), resize: "vertical", lineHeight: 1.7 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 10 },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  sectionTitle: { margin: 0, color: C.teal, fontWeight: 900, fontSize: 13.5 },
  addBtn: { background: "rgba(0,255,204,0.1)", border: "1px dashed rgba(0,255,204,0.4)", color: C.teal, padding: "7px 12px", fontWeight: 800, borderRadius: 10, fontSize: 12 },
  delBtn: { background: "rgba(255,92,122,0.12)", border: "1px solid rgba(255,92,122,0.35)", color: "#ff9cae", padding: "8px 12px", fontSize: 12, fontWeight: 800, borderRadius: 10, whiteSpace: "nowrap" },
  confirmBtn: { background: "rgba(34,229,132,0.12)", border: "1px solid rgba(34,229,132,0.4)", color: "#7cf5c0", padding: "6px 12px", fontSize: 11, fontWeight: 800, borderRadius: 9 },
  unconfirmBtn: { background: "rgba(255,176,32,0.12)", border: "1px solid rgba(255,176,32,0.4)", color: "#ffb020", padding: "6px 12px", fontSize: 11, fontWeight: 800, borderRadius: 9 },
  subRow: { display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "8px 10px", marginTop: 8, background: "rgba(255,255,255,0.02)" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  saveBtn: { padding: "12px 26px", fontWeight: 900, borderRadius: 12, fontSize: 13.5 },
  statBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 },
};