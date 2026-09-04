import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font } from "../theme";
import { useToast } from "./Toast";
import { useLang } from "../i18n/index.tsx";

interface TokenSetupPanelProps {
  token: string;
}

// التحقق من عنوان base58 صالح (محافظ/عقود سولانا بطول 32-44)
const isValidBase58 = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

export default function TokenSetupPanel({ token }: TokenSetupPanelProps) {
  const { t, dir } = useLang();
  const toast = useToast();
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  const [form, setForm] = useState({ tokenMint: "", tokenDecimals: 9, tokenSupply: 1_000_000, solanaNetwork: "devnet", treasuryWallet: "" });
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [s, ov] = await Promise.all([
        apiFetch("/api/users/settings", { headers }).then((r) => r.json()),
        apiFetch("/api/users/admin/distribution/overview", { headers })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      setForm({
        tokenMint: s.tokenMint || "",
        tokenDecimals: typeof s.tokenDecimals === "number" ? s.tokenDecimals : 9,
        tokenSupply: typeof s.tokenSupply === "number" ? s.tokenSupply : 1_000_000,
        solanaNetwork: s.solanaNetwork || "devnet",
        treasuryWallet: s.treasuryWallet || "",
      });
      setOverview(ov);
    } catch {
      setStatus({ type: "error", text: t("token.fetchError") });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const save = async () => {
    const mint = form.tokenMint.trim();
    const treasury = form.treasuryWallet.trim();
    if (!isValidBase58(mint)) return toast.error(t("token.errorInvalidMint"));
    if (!isValidBase58(treasury)) return toast.error(t("token.errorInvalidTreasury"));

    try {
      setSaving(true);
      setStatus(null);
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          tokenMint: mint,
          tokenDecimals: Number(form.tokenDecimals),
          tokenSupply: Math.max(0, Number(form.tokenSupply) || 0),
          solanaNetwork: form.solanaNetwork,
          treasuryWallet: treasury,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t("token.success"));
        setStatus({ type: "success", text: t("token.success") });
        fetchAll();
      } else {
        toast.error(data.message || t("token.errorSave"));
      }
    } catch {
      toast.error(t("token.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ ...styles.container, textAlign: "center", color: C.muted }}>{t("common.loading")}</div>;
  }

  const configured = Boolean(overview?.configured);
  const short = (s?: string) => (s && s.length > 14 ? `${s.substring(0, 6)}...${s.substring(s.length - 6)}` : s || "—");

  const statusStyle: React.CSSProperties =
    status?.type === "error"
      ? { background: "rgba(255,92,122,0.1)", borderColor: "rgba(255,92,122,0.3)", color: "#ff9cae" }
      : status?.type === "success"
      ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
      : { background: "rgba(0,255,204,0.08)", borderColor: "rgba(0,255,204,0.25)", color: C.teal };

  const steps = [t("token.step1"), t("token.step2"), t("token.step3"), t("token.step4"), t("token.step5")];

  return (
    <div style={{ ...styles.container, direction: dir }}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>{t("token.title")}</h1>
        <p style={styles.subtitle}>{t("token.subtitle")}</p>
      </div>

      {/* 🧭 شرح الآلية بشكل مفصّل */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("token.howTitle")}</h3>
        <ol style={styles.steps}>
          {steps.map((s, i) => (
            <li key={i} style={styles.step}>{s}</li>
          ))}
        </ol>
      </div>

      {/* ⚙️ الإعداد الحالي */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("token.currentTitle")}</h3>
        <div style={styles.badgeRow}>
          <span className="pill" style={configured
            ? { background: "rgba(0,255,119,0.12)", color: "#00ff77", border: "1px solid rgba(0,255,119,0.25)" }
            : { background: "rgba(255,170,0,0.12)", color: "#ffaa00", border: "1px solid rgba(255,170,0,0.25)" }}>
            {configured ? t("token.configured") : t("token.notConfigured")}
          </span>
        </div>
        <div style={styles.kvGrid}>
          <div style={styles.kv}><span style={styles.kvLabel}>{t("token.mintLabel")}</span><span style={styles.kvValue}>{short(form.tokenMint)}</span></div>
          <div style={styles.kv}><span style={styles.kvLabel}>{t("token.network")}</span><span style={styles.kvValue}>{form.solanaNetwork}</span></div>
          <div style={styles.kv}><span style={styles.kvLabel}>{t("token.treasuryLabel")}</span><span style={styles.kvValue}>{short(form.treasuryWallet)}</span></div>
          <div style={styles.kv}><span style={styles.kvLabel}>{t("token.treasuryBalance")}</span><span style={{ ...styles.kvValue, color: C.teal, fontWeight: 800 }}>{configured ? `${Number(overview?.treasuryBalance || 0).toFixed(3)}` : "—"}</span></div>
        </div>
      </div>

      {/* 🔗 نموذج الربط اليدوي */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("token.title")}</h3>

        <label style={styles.label}>{t("token.mintLabel")}</label>
        <input
          className="input"
          value={form.tokenMint}
          onChange={(e) => setForm({ ...form, tokenMint: e.target.value })}
          placeholder={t("token.mintPlaceholder")}
          style={{ ...styles.input, direction: "ltr", fontFamily: "monospace" }}
        />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("token.decimalsLabel")}</label>
            <input
              className="input"
              type="number"
              min={0}
              max={9}
              value={form.tokenDecimals}
              onChange={(e) => setForm({ ...form, tokenDecimals: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })}
              style={styles.input}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("token.networkLabel")}</label>
            <select
              value={form.solanaNetwork}
              onChange={(e) => setForm({ ...form, solanaNetwork: e.target.value })}
              style={{ ...styles.input, color: C.text }}
            >
              <option value="devnet">devnet</option>
              <option value="mainnet-beta">mainnet-beta</option>
            </select>
          </div>
        </div>

        <label style={styles.label}>{t("token.treasuryLabel")}</label>
        <input
          className="input"
          value={form.treasuryWallet}
          onChange={(e) => setForm({ ...form, treasuryWallet: e.target.value })}
          placeholder={t("token.treasuryPlaceholder")}
          style={{ ...styles.input, direction: "ltr", fontFamily: "monospace" }}
        />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("token.supplyLabel")}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.tokenSupply}
              onChange={(e) => setForm({ ...form, tokenSupply: Math.max(0, Number(e.target.value) || 0) })}
              style={styles.input}
            />
          </div>
        </div>

        <button onClick={save} disabled={saving} className="btn btn-amber btn-block" style={{ padding: 15, marginTop: 16 }}>
          {saving ? t("token.saving") : t("token.saveBtn")}
        </button>
      </div>

      {status && (
        <div style={{ ...styles.statusBox, ...statusStyle }}>
          {status.text}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", fontFamily: font },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 1.7 },
  card: { padding: 24 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  steps: { margin: 0, paddingInlineStart: 22, color: C.muted, fontSize: 13, lineHeight: 2 },
  step: { marginBottom: 8 },
  badgeRow: { marginBottom: 14 },
  kvGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 },
  kv: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 6 },
  kvLabel: { color: C.muted, fontSize: 12, fontWeight: 700 },
  kvValue: { fontSize: 15, fontWeight: 800, color: C.text, wordBreak: "break-all" },
  label: { display: "block", color: C.muted, fontSize: 13, fontWeight: 700, margin: "14px 0 8px" },
  input: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontFamily: font, outline: "none", color: C.text },
  row: { display: "flex", gap: 12 },
  statusBox: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,255,204,0.25)", fontSize: 13, lineHeight: 1.7, textAlign: "right" },
};
