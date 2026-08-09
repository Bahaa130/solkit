import React, { useState, useEffect } from "react";

interface WithdrawalPageProps {
  userId: number;
  token: string;
}

export default function WithdrawalPage({ userId, token }: WithdrawalPageProps) {
  const [balance, setBalance] = useState<number>(0.0);
  const [address, setAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. دالة جلب البيانات الآمنة (الرصيد وسجل العمليات من الـ MySQL)
  const fetchWithdrawalData = async () => {
    if (!token || !userId) return;
    try {
      setErrorMessage(null);
      const headers = { "Authorization": `Bearer ${token}` };

      // أ. جلب بيانات رصيد الحساب المحدثة
      const userRes = await fetch(`/api/users/${userId}`, { headers });
      if (userRes.ok) {
        const textData = await userRes.text();
        if (textData) {
          const userData = JSON.parse(textData);
          setBalance(Number(userData.balance || 0));
          if (userData.walletAddress && !address) setAddress(userData.walletAddress);
        }
      }

      // ب. جلب سجل السحوبات الموثق بالبلوكشين
      const historyRes = await fetch("/api/users/withdraw-history", { headers });
      if (historyRes.ok) {
        const historyText = await historyRes.text();
        if (historyText) {
          setHistory(JSON.parse(historyText));
        }
      }
    } catch (error) {
      console.error("Failed to load withdrawal data safely:", error);
      setErrorMessage("خطأ في مزامنة سجلات السحب من الخادم.");
    }
  };

  useEffect(() => {
    fetchWithdrawalData();
  }, [userId, token]);

  // 2. معالجة طلب سحب عملات SOLKIT جديد
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!amount || Number(amount) <= 0) {
      return alert("الرجاء إدخال كمية سحب صالحة وأكبر من الصفر!");
    }
    if (!address || address.length < 32) {
      return alert("الرجاء إدخال عنوان محفظة سولانا صحيح لاستقبال الأرباح!");
    }

    try {
      setLoading(true);
      const res = await fetch("/api/users/withdraw", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ amount: Number(amount), walletAddress: address }),
      });

      const textResponse = await res.text();
      if (res.ok) {
        alert("تم تقديم طلب سحب العملات بنجاح! وهو قيد المراجعة الفورية حالياً 🟠");
        setAmount("");
        fetchWithdrawalData(); // تحديث فوري حي للسجل والرصيد
      } else {
        const errData = textResponse ? JSON.parse(textResponse) : {};
        alert(errData.message || "فشلت عملية السحب، تأكد من كفاية رصيدك المتاح.");
      }
    } catch (error) {
      alert("خطأ في الاتصال بالسيرفر أثناء إرسال طلب السحب.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* بطاقة عرض الرصيد المتاح الحقيقي */}
      <div style={styles.balanceCard}>
        <span style={styles.balanceLabel}>الرصيد المتاح للسحب الفوري</span>
        <h1 style={styles.balanceValue}>{balance.toFixed(8)} SOLKIT</h1>
      </div>

      {/* نموذج تقديم طلب السحب */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>تقديم طلب سحب جديد (شبكة Solana)</h3>
        <form onSubmit={handleWithdrawSubmit} style={styles.form}>
          <input 
            type="text" 
            placeholder="عنوان محفظة Solana المستقبلة (32-44 حرفاً)" 
            value={address} 
            onChange={(e) => setAddress(e.target.value)} 
            style={styles.input} 
          />
          <input 
            type="number" 
            placeholder="الكمية المراد سحبها (الحد الأدنى 10 عملات)" 
            value={amount} 
            onChange={(e) => setAmount(e.target.value)} 
            style={styles.input} 
          />
          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "جاري تشفير وتأمين طلبك..." : "تأكيد طلب السحب المالي 💸"}
          </button>
        </form>
      </div>

      {/* جدول السجلات والتاريخ الملون المزامر من MySQL */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>سجل المعاملات وتواقيع البلوكشين القائمة</h3>
        {errorMessage && <p style={{ color: "#ff4d4d", textAlign: "center", fontSize: "13px" }}>{errorMessage}</p>}
        
        {history.length === 0 ? (
          <p style={styles.noData}>لا توجد أي عمليات سحب سابقة مسجلة لهذا الحساب حتى الآن.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>الكمية المطلوبة</th>
                  <th style={styles.th}>حالة المعاملة</th>
                  <th style={styles.th}>رمز التحقق (TxHash)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((tx: any) => (
                  <tr key={tx.id} style={styles.tdRow}>
                    <td style={{ ...styles.td, color: "#00ffcc", fontWeight: "bold" }}>
                      {Number(tx.amount).toFixed(4)}
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: tx.status === "pending" ? "rgba(255,170,0,0.12)" : tx.status === "completed" ? "rgba(0,255,119,0.12)" : "rgba(255,77,77,0.12)",
                        color: tx.status === "pending" ? "#ffaa00" : tx.status === "completed" ? "#00ff77" : "#ff4d4d",
                        border: `1px solid ${tx.status === "pending" ? "rgba(255,170,0,0.2)" : tx.status === "completed" ? "rgba(0,255,119,0.2)" : "rgba(255,77,77,0.2)"}`
                      }}>
                        {tx.status === "pending" && "🟠 معلق"}
                        {tx.status === "completed" && "🟢 مكتمل"}
                        {tx.status === "failed" && "🔴 مرفوض"}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: "#a1a7bb", font: "monospace", fontSize: "12px" }}>
                      {tx.txHash ? (
                        <a href={`https://solscan.io{tx.txHash}?cluster=devnet`} target="_blank" rel="noreferrer" style={styles.link}>
                          {tx.txHash.substring(0, 6)}...{tx.txHash.substring(tx.txHash.length - 6)} 🔗
                        </a>
                      ) : (
                        <span style={{ color: "#717694" }}>قيد تدقيق المسؤول</span>
                      )}
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
  container: { padding: "20px", maxWidth: "600px", margin: "0 auto", color: "#fff", direction: "rtl", fontFamily: "sans-serif" },
  balanceCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", textAlign: "center", marginBottom: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  balanceLabel: { color: "#a1a7bb", fontSize: "13px", display: "block", marginBottom: "6px" },
  balanceValue: { color: "#00ffcc", fontSize: "28px", margin: 0, fontWeight: "bold" },
  card: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", marginBottom: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  cardTitle: { fontSize: "15px", color: "#fff", margin: "0 0 15px 0", borderBottom: "1px solid #222531", paddingBottom: "10px", fontWeight: "bold" },
  form: { display: "flex", flexDirection: "column", gap: "15px" },
  input: { backgroundColor: "#1f2235", border: "1px solid #2d314d", borderRadius: "8px", padding: "12px", color: "#fff", fontSize: "13px", outline: "none" },
  submitBtn: { backgroundColor: "#00ffcc", color: "#0c0d14", border: "none", borderRadius: "8px", padding: "14px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" },
  noData: { color: "#a1a7bb", textAlign: "center", fontSize: "13px", margin: "20px 0" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right" },
  thRow: { borderBottom: "2px solid #2d314d" },
  th: { color: "#a1a7bb", padding: "10px", fontSize: "12px", fontWeight: "normal" },
  tdRow: { borderBottom: "1px solid #222531" },
  td: { padding: "14px 10px", color: "#fff", fontSize: "13px" },
  statusBadge: { padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold" },
  link: { color: "#00ffcc", textDecoration: "none" }
};
