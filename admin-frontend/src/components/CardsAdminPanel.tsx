// src/components/CardsAdminPanel.tsx
// 🎴 إدارة الكروت بالكامل من المدير: إضافة / حذف / تعديل + مدة كل ترقية (بالساعات)
import { apiFetch } from "../lib/api";
import React, { useEffect, useState } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useToast } from "../components/Toast";

interface CardRow {
  key: string;
  icon: string;
  image: string;
  label: string;
  color: string;
  baseCost: string;
  costGrowth: string;
  reward: string;
  maxLevel: string;
  duration: string;
}

interface Props { token: string; }

const COLORS = ["#f43f5e", "#8b5cf6", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#00ffcc", "#ffb020", "#ec4899", "#3b82f6"];

export default function CardsAdminPanel({ token }: Props) {
  const { t } = useLang();
  const toast = useToast();
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  const [rows, setRows] = useState<CardRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch("/api/users/settings");
      const d = await res.json();
      if (res.ok && Array.isArray(d.cards) && d.cards.length) {
        setRows(d.cards.map((c: any) => ({
          key: String(c.key || ""),
          icon: String(c.icon || "🎴"),
          image: String(c.image || ""),
          label: String(c.label || ""),
          color: String(c.color || "#7c5cff"),
          baseCost: String(c.baseCost ?? ""),
          costGrowth: String(c.costGrowth ?? ""),
          reward: String(c.reward ?? ""),
          maxLevel: String(c.maxLevel ?? ""),
          duration: String(c.duration ?? "1"),
        })));
      }
    } catch { /* تجاهل */ }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setField = (i: number, key: keyof CardRow, val: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  };

  const addRow = () => {
    const base = `card_${Date.now().toString(36)}`;
    setRows((prev) => [...prev, {
      key: base, icon: "🎴", image: "", label: "", color: COLORS[prev.length % COLORS.length],
      baseCost: "100", costGrowth: "1.2", reward: "0.05", maxLevel: "10", duration: "1",
    }]);
  };

  const removeRow = (i: number) => {
    const key = rows[i]?.key;
    if (confirmKey === key) {
      setRows((prev) => prev.filter((_, idx) => idx !== i));
      setConfirmKey(null);
    } else {
      setConfirmKey(key ?? null);
    }
  };

  const save = async () => {
    const blocked = rows.some((r) => !r.key.trim() || !r.label.trim());
    if (blocked) { toast.error(t("admin.cardsInvalid")); return; }
    const cards = rows.map((r) => {
      const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
      return {
        key: r.key.trim().slice(0, 60),
        icon: r.icon.trim().slice(0, 12) || "🎴",
        image: r.image.trim() || undefined,
        label: r.label.trim().slice(0, 60),
        color: r.color.trim().slice(0, 20) || "#7c5cff",
        baseCost: Math.max(0, num(r.baseCost, 100)),
        costGrowth: Math.max(1, num(r.costGrowth, 1.2)),
        reward: Math.max(0, num(r.reward, 0)),
        maxLevel: Math.min(1000, Math.max(1, Math.round(num(r.maxLevel, 1)))),
        duration: Math.min(8760, Math.max(0, num(r.duration, 1))),
      };
    });
    if (!cards.length) { toast.error(t("admin.cardsInvalid")); return; }
    try {
      setSaving(true);
      const res = await apiFetch("/api/users/admin/settings", { method: "POST", headers, body: JSON.stringify({ cards }) });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || t("admin.cardsSaved"));
        load();
      } else {
        toast.error(data.message || t("admin.settingsError"));
      }
    } catch {
      toast.error(t("admin.settingsError"));
    } finally {
      setSaving(false);
    }
  };

  // 🖼️ رفع صورة مصغّرة للكارت — تُخزَّن على الخادم ويُحفظ رابطها في إعدادات الكروت
  const handleImage = async (i: number, file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error(t("admin.cardsImageError")); return; }
    const okType = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type);
    if (!okType) { toast.error(t("admin.cardsImageError")); return; }
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch("/api/users/admin/card-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dataUri }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, image: data.url } : r)));
        toast.success(t("admin.cardsImageUploaded"));
      } else {
        toast.error(data.message || t("admin.cardsImageError"));
      }
    } catch {
      toast.error(t("admin.cardsImageError"));
    }
  };

  const removeImage = async (i: number) => {
    const url = rows[i]?.image;
    if (!url) return;
    try {
      await apiFetch("/api/users/admin/card-image/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
    } catch { /* تجاهل فشل حذف الملف */ }
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, image: "" } : r)));
  };

  return (
    <div className="glass" style={styles.card}>
      <h3 style={styles.title}>🎴 {t("admin.cardsTitle")}</h3>
      <p style={styles.sub}>{t("admin.cardsDesc")}</p>

      {rows.map((r, i) => (
        <div key={r.key} style={styles.row}>
          <p style={{ margin: "0 0 10px", color: C.faint, fontSize: 11, lineHeight: 1.7 }}>
            <span style={{ color: C.teal, fontWeight: 800 }}>⬆️ صورة: </span>
            {t("admin.cardsImageNote")}
          </p>
          <div style={styles.rowHeader}>
            <div style={styles.imgWrap}>
              {r.image ? (
                <>
                  <img src={r.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    onClick={() => removeImage(i)}
                    title={t("admin.cardsRemoveImage")}
                    style={styles.imgRemove}
                  >✕</button>
                </>
              ) : (
                <span style={{ fontSize: 20, color: C.muted }}>{r.icon || "🎴"}</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => { handleImage(i, e.target.files?.[0]); e.target.value = ""; }}
                style={styles.fileInput}
              />
            </div>
            <input
              className="input"
              value={r.icon}
              onChange={(e) => setField(i, "icon", e.target.value)}
              style={{ ...styles.input, width: 58, textAlign: "center" }}
              maxLength={4}
            />
            <input
              className="input"
              value={r.label}
              onChange={(e) => setField(i, "label", e.target.value)}
              placeholder={t("admin.cardsName")}
              style={{ ...styles.input, flex: 1 }}
            />
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(r.color) ? r.color : "#7c5cff"} onChange={(e) => setField(i, "color", e.target.value)} style={styles.colorPick} />
            <button
              onClick={() => removeRow(i)}
              className="btn"
              style={{
                ...styles.delBtn,
                ...(confirmKey === r.key ? { background: "#ff5c7a", borderColor: "#ff5c7a", color: "#fff" } : {}),
              }}
            >
              {confirmKey === r.key ? t("admin.cardsDeleteConfirm") : "🗑️"}
            </button>
          </div>
          <div style={styles.rowGrid}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.cardsCost")}</span>
              <input className="input" type="number" min="0" value={r.baseCost} onChange={(e) => setField(i, "baseCost", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.cardsGrowth")}</span>
              <input className="input" type="number" step="0.01" min="1" value={r.costGrowth} onChange={(e) => setField(i, "costGrowth", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.cardsReward")}</span>
              <input className="input" type="number" step="0.001" min="0" value={r.reward} onChange={(e) => setField(i, "reward", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.cardsMax")}</span>
              <input className="input" type="number" min="1" value={r.maxLevel} onChange={(e) => setField(i, "maxLevel", e.target.value)} style={styles.input} />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>{t("admin.cardsDuration")}</span>
              <input className="input" type="number" step="0.5" min="0" value={r.duration} onChange={(e) => setField(i, "duration", e.target.value)} style={styles.input} />
            </label>
          </div>
        </div>
      ))}

      <div style={styles.actions}>
        <button onClick={addRow} className="btn" style={styles.addBtn}>{t("admin.cardsAdd")}</button>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={styles.saveBtn}>
          {saving ? t("common.loading") : t("admin.saveBtn")}
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  card: { borderRadius: 18, padding: "20px 18px", fontFamily: font },
  title: { margin: "0 0 6px", fontSize: 16, fontWeight: 900, color: C.text },
  sub: { margin: "0 0 16px", color: C.muted, fontSize: 12, lineHeight: 1.8 },
  row: { border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "12px 12px 10px", background: "rgba(255,255,255,0.025)", marginBottom: 12 },
  rowHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  input: { background: "rgba(7,11,22,0.7)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: C.text, fontFamily: font, fontSize: 12.5, padding: "9px 10px", outline: "none", minWidth: 0 },
  colorPick: { width: 40, height: 38, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, background: "rgba(7,11,22,0.7)", cursor: "pointer", padding: 2 },
  delBtn: { background: "rgba(255,92,122,0.12)", border: "1px solid rgba(255,92,122,0.35)", color: "#ff9cae", padding: "8px 12px", fontSize: 12, fontWeight: 800, borderRadius: 10, whiteSpace: "nowrap" },
  rowGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  fieldLabel: { color: C.muted, fontSize: 10.5, fontWeight: 700 },
  actions: { display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 },
  addBtn: { background: "rgba(0,255,204,0.1)", border: "1px dashed rgba(0,255,204,0.4)", color: C.teal, padding: "11px 16px", fontWeight: 900, borderRadius: 12, fontSize: 13 },
  saveBtn: { padding: "11px 22px", fontWeight: 900, borderRadius: 12, fontSize: 13 },
  imgWrap: { position: "relative", width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  fileInput: { position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" },
  imgRemove: { position: "absolute", top: 0, right: 0, background: "rgba(0,0,0,0.75)", color: "#ff5c7a", border: "none", borderRadius: "0 0 0 8px", fontSize: 11, lineHeight: 1, padding: "3px 6px", cursor: "pointer", fontWeight: 900 },
};