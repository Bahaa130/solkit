import React, { useState, useEffect } from "react";

interface ReferralMember {
  id: number;
  email: string;
  joinDate: string;
  status: string;
  bonusEarned: number;
}

interface ReferralData {
  referralCode: string;
  totalReferrals: number;
  activeReferrals: number;
  totalReferralEarnings: number;
  referralList: ReferralMember[];
}

export default function ReferralPage({ userId }: { userId: number }) {
  const [data, setData] = useState<ReferralData | null>(null);

  const fetchReferralData = async () => {
    try {
      const res = await fetch(`/api/users/${userId}/referral-network`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to load referral network:", error);
    }
  };

  useEffect(() => {
    fetchReferralData();
  }, [userId]);

  const handleCopyLink = () => {
    if (!data) return;
    // بناء رابط الإحالة المباشر للموقع
    const inviteLink = `${window.location.origin}?ref=${data.referralCode}`;
    navigator.clipboard.writeText(inviteLink);
    alert("تم نسخ رابط دعوة الإحالة الخاص بك بنجاح! 🔗📋");
  };

  if (!data) return <div style={{ color: "#fff", textAlign: "center", padding: "40px" }}>جاري تحميل شبكة الإحالة...</div>;

  return (
    <div style={styles.container}>
      {/* لوحة الإحصائيات والأرباح من الـ 1 دولار */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>أرباح الإحالات المكتسبة</span>
          <h2 style={{ ...styles.statValue, color: "#00ffcc" }}>${data.totalReferralEarnings.toFixed(2)}</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>إجمالي المدعوين</span>
          <h2 style={styles.statValue}>{data.totalReferrals} عضو</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>الحسابات المفعّلة</span>
          <h2 style={{ ...styles.statValue, color: "#00ff77" }}>{data.activeReferrals}</h2>
        </div>
      </div>

      {/* صندوق رابط الإحالة والمشاركة */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>رابط الإحالة المخصص لك</h3>
        <p style={styles.description}>
          عند قيام أي مستخدم بالتسجيل من رابطك؛ سيدفع 2$ للتفعيل (1$ تذهب لمحفظة الموقع كرسوم، و 1$ تنزل في حسابك فوراً كأرباح!)
        </p>
        <div style={styles.copyBox}>
          <input
            type="text"
            readOnly
            value={`${window.location.origin}?ref=${data.referralCode}`}
            style={styles.inputLink}
          />
          <button onClick={handleCopyLink} style={styles.copyBtn}>نسخ الرابط 📋</button>
        </div>
      </div>

      {/* قائمة الإحالات وجدول الأعضاء */}
      <div style={styles.tableCard}>
        <h3 style={styles.cardTitle}>قائمة الأعضاء المسجلين من خلالك</h3>
        {data.referralList.length === 0 ? (
          <p style={styles.noData}>لا يوجد أعضاء مسجلين عبر رابطك حتى الآن.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>المستخدم (مخفي للخصوصية)</th>
                  <th style={styles.th}>تاريخ الانضمام</th>
                  <th style={styles.th}>حالة الحساب</th>
                  <th style={styles.th}>أرباحك منه</th>
                </tr>
              </thead>
              <tbody>
                {data.referralList.map((member) => (
                  <tr key={member.id} style={styles.tdRow}>
                    <td style={styles.td}>{member.email}</td>
                    <td style={styles.td}>{new Date(member.joinDate).toLocaleDateString("ar-EG")}</td>
                    <td style={styles.td}>
                      <span style={{
                        color: member.status.includes("مفعل") ? "#00ff77" : "#ffff00",
                        fontWeight: "bold"
                      }}>
                        {member.status}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: "#00ffcc", fontWeight: "bold" }}>
                      ${member.bonusEarned.toFixed(2)}
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
  container: { padding: "20px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "800px", margin: "0 auto", direction: "rtl" },
  statsRow: { display: "flex", gap: "15px", justifyContent: "space-between", flexWrap: "wrap" },
  statCard: { backgroundColor: "#171924", borderRadius: "12px", padding: "20px", flex: 1, minWidth: "150px", textAlign: "center", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  statLabel: { color: "#a1a7bb", fontSize: "13px" },
  statValue: { margin: "10px 0 0 0", fontSize: "24px", color: "#fff" },
  card: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  cardTitle: { fontSize: "16px", color: "#fff", margin: "0 0 15px 0", borderBottom: "1px solid #222531", paddingBottom: "10px" },
  description: { color: "#a1a7bb", fontSize: "13px", lineHeight: "1.6", margin: "0 0 20px 0" },
  copyBox: { display: "flex", gap: "10px" },
  inputLink: { backgroundColor: "#1f2235", border: "1px solid #2d314d", borderRadius: "8px", padding: "12px", color: "#00ffcc", fontSize: "13px", flex: 1, outline: "none" },
  copyBtn: { backgroundColor: "#00ffcc", color: "#0c0d14", border: "none", borderRadius: "8px", padding: "0 20px", fontWeight: "bold", cursor: "pointer" },
  tableCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  noData: { color: "#a1a7bb", textAlign: "center", fontSize: "14px", margin: "20px 0" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: "13px" },
  thRow: { borderBottom: "2px solid #2d314d" },
  th: { color: "#a1a7bb", padding: "12px 8px", fontWeight: "normal" },
  tdRow: { borderBottom: "1px solid #222531" },
  td: { padding: "14px 8px", color: "#fff" }
};
