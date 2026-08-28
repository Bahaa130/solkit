import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font } from "../theme";
import { useBranding } from "../branding";
import { useLang } from "../i18n/index.tsx";
import { useToast } from "../components/Toast";

interface ReferralPageProps {
  userId: number;
  token: string;
}

export default function ReferralPage({ userId, token }: ReferralPageProps) {
  const { dir, t, lang } = useLang();
  const { branding } = useBranding();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const fetchReferralData = async () => {
    if (!token) {
      setError(t("referral.sessionExpired"));
      return;
    }

    try {
      setError(null);
      // جلب بيانات رادار شبكة الإحالة والعمولات الفورية من الـ MySQL بالتوجيه الصحيح
      const res = await apiFetch("/api/users/referral-network", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // تمرير التوكن الأمني الصارم الفعال 🛡️
        }
      });

      const rawText = await res.text(); // قراءة الاستجابة كنص أولاً لمنع انهيار الـ JSON input crash

      if (res.ok && rawText) {
        const resData = JSON.parse(rawText);
        setData(resData);
      } else {
        const errObj = rawText ? JSON.parse(rawText) : {};
        setError(errObj.message || t("referral.fetchFailed"));
      }
    } catch (err: any) {
      console.error("Referral fetch UX breakdown:", err);
      setError(t("referral.connError"));
    }
  };

  useEffect(() => {
    fetchReferralData();
  }, [userId, token]);

  // دالة نسخ رابط الإحالة للمستخدم لمشاركته على السوشيال ميديا
  const handleCopyLink = () => {
    if (!data) return;
    const inviteLink = `${window.location.origin}?ref=${data.referralCode}`;
    navigator.clipboard.writeText(inviteLink);
    toast.success(t("referral.copySuccess"));
  };

  // 📲 لوحة المشاركة الأصلية في نظام أندرويد (والويب) — تفتح الواتساب/تيليجرام/أي تطبيق
  const handleShareLink = async () => {
    if (!data) return;
    const inviteLink = `${window.location.origin}?ref=${data.referralCode}`;
    const shareText = t("referral.shareBody", { app: branding.projectName });
    if (navigator.share) {
      try {
        await navigator.share({ title: branding.projectName, text: shareText, url: inviteLink });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    // احتياط: إذ لم تتوفر لوحة المشاركة (متصفح قديم) ننسخ النص مباشرة
    await navigator.clipboard.writeText(`${shareText}\n${inviteLink}`);
    toast.success(t("referral.copySuccess"));
  };

  if (error) {
    return <div style={{ color: C.red, textAlign: "center", padding: "60px 20px" }}>⚠️ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: C.text, textAlign: "center", padding: 60 }}>{t("referral.loading")}</div>;
  }

  const tableAlign = dir === "rtl" ? "right" : "left";

  return (
    <div style={{ ...styles.container, direction: dir }}>
      {/* صف الإحصائيات الرقمية لعمولات تقسيم الـ 0.015 SOL */}
      <div style={styles.statsRow}>
        <div className="glass" style={styles.statCard}>
          <span style={styles.statLabel}>{t("referral.earnings")}</span>
          <h2 style={{ ...styles.statValue, color: C.teal }}>{Number(data.totalReferralEarnings || 0).toFixed(3)} <span style={{ fontSize: 13 }}>SOL</span></h2>
        </div>
        <div className="glass" style={styles.statCard}>
          <span style={styles.statLabel}>{t("referral.totalInvited")}</span>
          <h2 style={styles.statValue}>{data.totalReferrals || 0} {t("referral.member")}</h2>
        </div>
        <div className="glass" style={styles.statCard}>
          <span style={styles.statLabel}>{t("referral.activeAccounts")}</span>
          <h2 style={{ ...styles.statValue, color: C.green }}>{data.activeReferrals || 0}</h2>
        </div>
      </div>

      {/* بطاقة رابط الإحالة الفاخرة */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("referral.linkTitle")}</h3>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 15, lineHeight: 1.8 }}>
          {t("referral.linkDesc")}{" "}
          <strong style={{ color: C.teal }}>{t("referral.linkReward")}</strong>
        </p>
        <div style={styles.copyBox}>
          <input
            className="input"
            type="text"
            readOnly
            value={`${window.location.origin}?ref=${data.referralCode}`}
            style={{ textAlign: "center", color: C.teal, fontWeight: 700 }}
          />
          <button onClick={handleCopyLink} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>{t("referral.copyBtn")}</button>
        </div>
        <button onClick={handleShareLink} className="btn btn-purple btn-block" style={{ marginTop: 12, padding: "13px" }}>
          {t("referral.shareBtn")}
        </button>
      </div>

      {/* جدول عرض الأعضاء المسجلين من خلاله والمزامر من الـ MySQL */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>{t("referral.membersTitle")}</h3>
        {data.referralList.length === 0 ? (
          <p style={styles.noData}>{t("referral.noData")}</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, textAlign: tableAlign }}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>{t("referral.thUser")}</th>
                  <th style={styles.th}>{t("referral.thJoin")}</th>
                  <th style={styles.th}>{t("referral.thStatus")}</th>
                  <th style={styles.th}>{t("referral.thEarned")}</th>
                </tr>
              </thead>
              <tbody>
                {data.referralList.map((member: any) => {
                  const paid = member.status.includes("مفعل");
                  return (
                    <tr key={member.id} style={styles.tdRow}>
                      <td style={styles.td}>{member.email}</td>
                      <td style={styles.td}>{new Date(member.joinDate).toLocaleDateString(lang === "ar" ? "ar-EG" : lang)}</td>
                      <td style={styles.td}>
                        <span className="pill" style={{
                          background: paid ? "rgba(0,255,119,0.12)" : "rgba(255,170,0,0.12)",
                          color: paid ? "#00ff77" : "#ffaa00",
                          border: `1px solid ${paid ? "rgba(0,255,119,0.25)" : "rgba(255,170,0,0.25)"}`
                        }}>
                          {t(paid ? "referral.statusActive" : "referral.statusInactive")}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: C.teal, fontWeight: 800 }}>
                        {Number(member.bonusEarned || 0).toFixed(3)} SOL
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 800,
    margin: "0 auto",
    direction: "rtl",
    fontFamily: font
  },
  statsRow: { display: "flex", gap: 15, justifyContent: "space-between", flexWrap: "wrap" },
  statCard: { borderRadius: 18, padding: 22, flex: 1, minWidth: 150, textAlign: "center" },
  statLabel: { color: C.muted, fontSize: 13 },
  statValue: { margin: "10px 0 0 0", fontSize: 22, color: C.text, fontWeight: 900 },
  card: { padding: 24 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: C.text, margin: "0 0 15px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  copyBox: { display: "flex", gap: 10 },
  noData: { color: C.muted, textAlign: "center", fontSize: 13, margin: "20px 0" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right" },
  thRow: { borderBottom: "1px solid rgba(255,255,255,0.12)" },
  th: { color: C.muted, padding: 10, fontSize: 12, fontWeight: 700 },
  tdRow: { borderBottom: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "14px 10px", color: C.text, fontSize: 13, fontFamily: "monospace" },
};
