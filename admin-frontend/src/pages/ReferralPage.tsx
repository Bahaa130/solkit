import React, { useState, useEffect } from "react";

interface ReferralPageProps {
  userId: number;
  token: string;
}

export default function ReferralPage({ userId, token }: ReferralPageProps) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReferralData = async () => {
    if (!token) {
      setError("جلسة العمل منتهية الصلاحية، يرجى إعادة تسجيل الدخول.");
      return;
    }

    try {
      setError(null);
      // جلب بيانات رادار شبكة الإحالة والعمولات الفورية من الـ MySQL بالتوجيه الصحيح
      const res = await fetch("/api/users/referral-network", {
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
        setError(errObj.message || "فشل السيرفر في تمرير بيانات شبكة الإحالة المحمية!");
      }
    } catch (err: any) {
      console.error("Referral fetch UX breakdown:", err);
      setError("خطأ في الاتصال بالخادم لمزامنة الإحالات.");
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
    alert("تم نسخ رابط دعوة الإحالة المخصص لك بنجاح! 🔗📋");
  };

  if (error) {
    return <div style={{ color: "#ff4d4d", textAlign: "center", padding: "60px 20px" }}>⚠️ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: "#fff", textAlign: "center", padding: "60px" }}>جاري تحميل رادار شبكة دعوة الأصدقاء...</div>;
  }

  return (
    <div style={styles.container}>
      {/* صف الإحصائيات الرقمية لعمولات تقسيم الـ 2$ */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>أرباح الإحالات المكتسبة</span>
          <h2 style={{ ...styles.statValue, color: "#00ffcc" }}>${Number(data.totalReferralEarnings || 0).toFixed(2)}</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>إجمالي المدعوين</span>
          <h2 style={styles.statValue}>{data.totalReferrals || 0} عضو</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>الحسابات المفعّلة</span>
          <h2 style={{ ...styles.statValue, color: "#00ff77" }}>{data.activeReferrals || 0}</h2>
        </div>
      </div>

      {/* بطاقة رابط الإحالة الفاخرة */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>رابط الإحالة الخاص بك لجني العمولات</h3>
        <p style={{ color: "#a1a7bb", fontSize: "12px", marginBottom: "15px" }}>
          شارك هذا الرابط مع أصدقائك؛ بمجرد قيامهم بتفعيل حساباتهم بـ 2$، ستحصل حياً ومباشرة على <strong style={{ color: "#00ffcc" }}>1$ فورية</strong> في محفظتك قابلة للسحب!
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

      {/* جدول عرض الأعضاء المسجلين من خلاله والمزامر من الـ MySQL */}
      <div style={styles.tableCard}>
        <h3 style={styles.cardTitle}>قائمة أعضاء فريقك المدعوين</h3>
        {data.referralList.length === 0 ? (
          <p style={styles.noData}>لا يوجد أعضاء مسجلين عبر رابطك الشخصي حتى الآن.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>المستخدم (مشفّر)</th>
                  <th style={styles.th}>تاريخ الانضمام</th>
                  <th style={styles.th}>حالة الحساب المالية</th>
                  <th style={styles.th}>أرباحك المباشرة</th>
                </tr>
              </thead>
              <tbody>
                {data.referralList.map((member: any) => (
                  <tr key={member.id} style={styles.tdRow}>
                    <td style={styles.td}>{member.email}</td>
                    <td style={styles.td}>{new Date(member.joinDate).toLocaleDateString("ar-EG")}</td>
                    <td style={styles.td}>
                      <span style={{ 
                        padding: "4px 8px", 
                        borderRadius: "6px", 
                        fontSize: "11px", 
                        fontWeight: "bold",
                        backgroundColor: member.status.includes("مفعل") ? "rgba(0,255,119,0.12)" : "rgba(255,170,0,0.12)",
                        color: member.status.includes("مفعل") ? "#00ff77" : "#ffaa00"
                      }}>
                        {member.status}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: "#00ffcc", fontWeight: "bold" }}>${Number(member.bonusEarned || 0).toFixed(2)}</td>
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

// ==========================================
// 🎨 واجهة التنسيق اللوني والجمالي المظلم لـ CSS
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: "20px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "800px", margin: "0 auto", direction: "rtl", fontFamily: "sans-serif" },
  statsRow: { display: "flex", gap: "15px", justifyContent: "space-between", flexWrap: "wrap" },
  statCard: { backgroundColor: "#171924", borderRadius: "12px", padding: "20px", flex: 1, minWidth: "150px", textAlign: "center", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  statLabel: { color: "#a1a7bb", fontSize: "13px" },
  statValue: { margin: "10px 0 0 0", fontSize: "24px", color: "#fff", fontWeight: "bold" },
  card: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  cardTitle: { fontSize: "15px", color: "#fff", margin: "0 0 15px 0", borderBottom: "1px solid #222531", paddingBottom: "10px", fontWeight: "bold" },
  copyBox: { display: "flex", gap: "10px" },
  inputLink: { backgroundColor: "#1f2235", border: "1px solid #2d314d", borderRadius: "8px", padding: "12px", color: "#00ffcc", fontSize: "13px", flex: 1, outline: "none", textAlign: "center" },
  copyBtn: { backgroundColor: "#00ffcc", color: "#0c0d14", border: "none", borderRadius: "8px", padding: "0 20px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" },
  tableCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  noData: { color: "#a1a7bb", textAlign: "center", fontSize: "13px", margin: "20px 0" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right" },
  thRow: { borderBottom: "2px solid #2d314d" },
  th: { color: "#a1a7bb", padding: "10px", fontSize: "12px", fontWeight: "normal" },
  tdRow: { borderBottom: "1px solid #222531" },
  td: { padding: "14px 10px", color: "#fff", fontSize: "13px", fontFamily: "monospace" },
};
