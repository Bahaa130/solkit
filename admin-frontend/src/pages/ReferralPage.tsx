import React, { useState, useEffect } from "react";

interface ReferralPageProps { userId: number; token: string; }

export default function ReferralPage({ userId, token }: ReferralPageProps) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users/referral-network", {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(resData => setData(resData))
      .catch(err => console.error(err));
  }, [userId, token]);

  if (!data) return <div style={{ color: "#fff", textAlign: "center", padding: "40px" }}>جاري مزامنة رادار شبكة الإحالة...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}><span style={styles.label}>أرباحك المكتسبة</span><h2 style={{ color: "#00ffcc", margin: "5px 0 0 0" }}>${data.totalReferralEarnings}</h2></div>
        <div style={styles.statCard}><span style={styles.label}>إجمالي المدعوين</span><h2 style={{ margin: "5px 0 0 0" }}>{data.totalReferrals} عضو</h2></div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>رابط الدعوة الخاص بك</h3>
        <input type="text" readOnly value={`${window.location.origin}?ref=${data.referralCode}`} style={styles.input} />
        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?ref=${data.referralCode}`); alert("🔗 تم النسخ!") }} style={styles.btn}>نسخ رابط الإحالة 📋</button>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>قائمة أعضاء فريقك</h3>
        {data.referralList.length === 0 ? <p style={{ color: "#a1a7bb", textAlign: "center" }}>لا يوجد مسجلين عن طريقك حتى الآن.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.referralList.map((ref: any) => (
              <li key={ref.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #222531" }}>
                <span>{ref.email}</span>
                <span style={{ color: ref.status.includes("مفعل") ? "#00ff77" : "#ffaa00", fontWeight: "bold" }}>{ref.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: "20px", maxWidth: "600px", margin: "0 auto", direction: "rtl" as const },
  statsGrid: { display: "flex", gap: "15px", marginBottom: "20px" },
  statCard: { backgroundColor: "#171924", borderRadius: "12px", padding: "15px", flex: 1, textAlign: "center" as const },
  label: { color: "#a1a7bb", fontSize: "12px" },
  card: { backgroundColor: "#171924", borderRadius: "16px", padding: "20px", marginBottom: "20px" },
  cardTitle: { fontSize: "14px", color: "#fff", margin: "0 0 12px 0" },
  input: { backgroundColor: "#1f2235", border: "1px solid #2d314d", borderRadius: "8px", padding: "10px", color: "#00ffcc", width: "100%", boxSizing: "border-box" as const, outline: "none", textAlign: "center" as const },
  btn: { width: "100%", marginTop: "12px", padding: "12px", backgroundColor: "#00ffcc", border: "none", borderRadius: "8px", fontWeight: "bold" as const, cursor: "pointer" }
};
