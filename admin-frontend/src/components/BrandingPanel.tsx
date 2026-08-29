import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font } from "../theme";
import { useToast } from "./Toast";
import { useLang } from "../i18n/index.tsx";
import { useBranding } from "../branding";
import CoinIcon from "./CoinIcon";

interface BrandingPanelProps {
  token: string;
}

const MAX_ICON_BYTES = 1_500_000;

export default function BrandingPanel({ token }: BrandingPanelProps) {
  const { t, dir } = useLang();
  const toast = useToast();
  const { branding, setBranding } = useBranding();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [form, setForm] = useState({
    projectName: branding.projectName,
    tokenName: branding.tokenName,
    tokenSymbol: branding.tokenSymbol,
    tokenIcon: branding.tokenIcon,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: string; text: string } | null>(null);

  // 🔄 مزامنة النموذج مع بيانات الهوية when loaded from server
  useEffect(() => {
    setForm({
      projectName: branding.projectName,
      tokenName: branding.tokenName,
      tokenSymbol: branding.tokenSymbol,
      tokenIcon: branding.tokenIcon,
    });
    setLoading(false);
  }, [branding]);

  // 🖼️ رفع صورة الأيقونة وتحويلها إلى data URL (base64)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("branding.iconHint"));
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      toast.error(t("branding.iconTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, tokenIcon: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    try {
      setSaving(true);
      setStatus(null);
      const res = await apiFetch("/api/users/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectName: form.projectName.trim() || "SOLKIT",
          tokenName: form.tokenName.trim() || form.tokenSymbol.trim() || "SOLKIT",
          tokenSymbol: form.tokenSymbol.trim() || "SOLKIT",
          tokenIcon: form.tokenIcon,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBranding({
          projectName: data.projectName,
          tokenName: data.tokenName,
          tokenSymbol: data.tokenSymbol,
          tokenIcon: data.tokenIcon,
        });
        toast.success(t("branding.saved"));
        setStatus({ type: "success", text: t("branding.saved") });
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

  const statusStyle: React.CSSProperties =
    status?.type === "success"
      ? { background: "rgba(34,229,132,0.1)", borderColor: "rgba(34,229,132,0.3)", color: "#7cf5c0" }
      : { background: "rgba(0,255,204,0.08)", borderColor: "rgba(0,255,204,0.25)", color: C.teal };

  return (
    <div style={{ ...styles.container, direction: dir }}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>{t("branding.title")}</h1>
      </div>

      {/* 🖼️ معاينة حية */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("branding.preview")}</h3>
        <div style={styles.preview}>
          <CoinIcon size={56} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{form.projectName || "—"}</div>
            <div style={{ color: C.teal, fontWeight: 800, fontSize: 14 }}>
              {form.tokenSymbol || "—"} · {form.tokenName || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* 🏷️ حقول الهوية */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("branding.title")}</h3>

        <label style={styles.label}>{t("branding.projectName")}</label>
        <input
          className="input"
          value={form.projectName}
          onChange={(e) => setForm({ ...form, projectName: e.target.value })}
          style={styles.input}
        />

        <label style={styles.label}>{t("branding.tokenName")}</label>
        <input
          className="input"
          value={form.tokenName}
          onChange={(e) => setForm({ ...form, tokenName: e.target.value })}
          placeholder={t("branding.namePlaceholder")}
          style={styles.input}
        />

        <label style={styles.label}>{t("branding.tokenSymbol")}</label>
        <input
          className="input"
          value={form.tokenSymbol}
          onChange={(e) => setForm({ ...form, tokenSymbol: e.target.value })}
          placeholder={t("branding.symbolPlaceholder")}
          style={styles.input}
        />

        <label style={styles.label}>{t("branding.tokenIcon")}</label>
        <div style={styles.iconRow}>
          <CoinIcon size={48} />
          <input type="file" accept="image/*" onChange={onFile} style={{ flex: 1, minWidth: 160, color: C.muted, fontSize: 13 }} />
          {form.tokenIcon && (
            <button
              onClick={() => setForm({ ...form, tokenIcon: "" })}
              className="btn btn-ghost"
              style={{ padding: "8px 12px", fontSize: 12 }}
            >
              {t("branding.iconClear")}
            </button>
          )}
        </div>
        <p style={{ color: C.faint, fontSize: 11.5, margin: "8px 0 0" }}>{t("branding.iconHint")}</p>

        <button onClick={save} disabled={saving} className="btn btn-amber btn-block" style={{ padding: 15, marginTop: 16 }}>
          {saving ? t("token.saving") : t("branding.saveBtn")}
        </button>
      </div>

      {status && <div style={{ ...styles.statusBox, ...statusStyle }}>{status.text}</div>}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", fontFamily: font },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  card: { padding: 24 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  label: { display: "block", color: C.muted, fontSize: 13, fontWeight: 700, margin: "14px 0 8px" },
  input: { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", fontSize: 13, fontFamily: font, outline: "none", color: C.text },
  preview: { display: "flex", alignItems: "center", gap: 16 },
  iconRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px" },
  statusBox: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,255,204,0.25)", fontSize: 13, lineHeight: 1.7, textAlign: "right" },
};
