import React, { useState, useEffect } from "react";

interface WithdrawalPageProps { userId: number; token: string; }

export default function WithdrawalPage({ userId, token }: WithdrawalPageProps) {
  const [balance, setBalance] = useState<number>(0.0);
  const [address, setAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWithdrawalData = async () => {
    if (!token || !userId) return;
    try {
      const userRes = await fetch(`/api/users/${userId}`);
      if (userRes.ok) {
        const userData = await userRes.json();
        setBalance(Number(userData.balance || 0));
        if (userData.walletAddress) setAddress(userData.walletAddress);
      }

      const historyRes = await fetch("/api/users/withdraw-history", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (historyRes.ok) setHistory(await historyRes.json());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => { fetchWithdrawalData(); }, [userId, token]);

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch("/api/users/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ amount: Number(amount), walletAddress: address }),
      });

      if (res.ok) {
        alert("تم إيداع طلب سحب الأرباح بنجاح في سجل الانتظار 🟠");
        setAmount("");
        fetchWithdrawalData();
      } else {
        const err = await res.json();
        alert(err.message || "فشلت عملية تقديم طلب السحب");
      }
    } catch (error) {
      alert("خطأ في الاتصال بالشبكة");
    } finally { setLoading(false); }
  };

  return (
    <div style={styles.container}>
      <div style={styles.balanceCard}>
        <span style={styles.balanceLabel}>الرصيد المتاح للسحب الفوري</span>
        <h1 style={styles.balanceValue}>{balance.toFixed(8)} SOLKIT</h1>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>طلب سحب أرباح جديد (Solana)</h3>
        <form onSubmit={handleWithdrawSubmit} style={styles.form}>
          <input type="text" placeholder="عنوان محفظة Solana المستقبلة (32-44 حرفاً)" value={address} onChange={(e) => setAddress(e.target.value)} style={styles.input} />
          <input type="number" placeholder="الكمية المراد سحبها" value={amount} onChange={(e) => setAmount(e.target.value)} style={styles.input} />
          <button type="submit" disabled={loading} style={styles.submitBtn}>{loading ? "جاري تشفير ومعالجة المعاملة..." : "تأكيد طلب السحب المالي 💸"}</button>
        </form>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>سجل عمليات السحب الموثقة في البلوكشين</h3>
        {history.length === 0 ? <p style={{ color: "#a1a7bb", textAlign: "center", fontSize: "13px" }}>لا توجد سحوبات سابقة لك في هذا الحساب.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #2d314d", color: "#a1a7bb" }}>
                <th style={{ padding: "10px", textAlign: "right" }}>الكمية</th>
                <th style={{ padding: "10px", textAlign: "center" }}>الحالة</th>
                <th style={{ padding: "10px", textAlign: "left" }}>مُعرف المعاملة (TxHash)</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx: any) => (
                <tr key={tx.id} style={{ borderBottom: "1px solid #222531" }}>
                  <td style={{ padding: "12px 10px", color: "#00ffcc", fontWeight: "bold" }}>{Number(tx.amount).toFixed(4)}</td>
                  <td style={{ padding: "12px 10px", textAlign: "center" }}>
                    <span style={{
                      padding: "4px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "bold",
                      backgroundColor: tx.status === "pending" ? "rgba(255,170,0,0.15)" : tx.status === "completed" ? "rgba(0,255,119,0.15)" : "rgba(255,77,77,0.15)",
                      color: tx.status === "pending" ? "#ffaa00" : tx.status === "completed" ? "#00ff77" : "#ff4d4d"
                    }}>
                      {tx.status === "pending" && "🟠 معلق"}
                      {tx.status === "completed" && "🟢 مكتمل"}
                      {tx.status === "failed" && "🔴 مرفوض"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 10px", textAlign: "left", color: "#a1a7bb" }}>
                    {tx.txHash ? `${tx.txHash.substring(0,6)}...📋` : "في انتظار توقيع المدير"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: "20px", maxWidth: "600px", margin: "0 auto", color: "#fff", direction: "rtl", fontFamily: "sans-serif" },
  balanceCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "20px", textAlign: "center", marginBottom: "20px" },
  balanceLabel: { color: "#a1a7bb", fontSize: "13px" },
  balanceValue: { color: "#00ffcc", fontSize: "28px", margin: "5px 0 0 0" },
  card: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", marginBottom: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  cardTitle: { fontSize: "15px", color: "#fff", margin: "0 0 15px 0", borderBottom: "1px solid #222531", paddingBottom: "10px" },
  form: { display: "flex", flexDirection: "column", gap: "15px" },
  input: { backgroundColor: "#1f2235", border: "1px solid #2d314d", borderRadius: "8px", padding: "12px", color: "#fff", fontSize: "13px", outline: "none" },
  submitBtn: { backgroundColor: "#00ffcc", color: "#0c0d14", border: "none", borderRadius: "8px", padding: "14px", fontWeight: "bold", cursor: "pointer" }
};
