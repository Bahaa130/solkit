import React, { useState, useEffect } from "react";

// تعريف أنواع البيانات القادمة من الـ API للسجلات لـ TypeScript
interface WithdrawalHistory {
  id: number;
  walletAddress: string;
  amount: string | number;
  gasFee: string | number;
  txHash: string | null;
  status: "pending" | "completed" | "failed";
  createdAt: string;
}

export default function WithdrawalPage({ userId }: { userId: number }) {
  const BACKEND_URL = `/api/users/${userId}`;

  const [balance, setBalance] = useState<number>(0.0);
  const [address, setAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [history, setHistory] = useState<WithdrawalHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const MIN_WITHDRAW = 10; // الحد الأدنى للسحب كما حددناه في الخلفية
  const GAS_FEE = 0.000005; // رسوم شبكة سولانا الافتراضية

  // 1. جلب بيانات الرصيد وسجل العمليات عند فتح الصفحة
  const fetchWithdrawalData = async () => {
    try {
      // جلب رصيد المستخدم المحدث
      const userRes = await fetch(BACKEND_URL);
      if (userRes.ok) {
        const userData = await userRes.json();
        setBalance(Number(userData.balance || 0));
        // ملء عنوان المحفظة تلقائياً إذا كان مسجلاً مسبقاً في حسابه
        if (userData.walletAddress) setAddress(userData.walletAddress);
      }

      // جلب سجل السحوبات والتاريخ من الخلفية
      const historyRes = await fetch(`${BACKEND_URL}/withdraw-history`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData);
      }
    } catch (error) {
      console.error("Failed to load withdrawal data:", error);
    }
  };

  useEffect(() => {
    fetchWithdrawalData();
  }, [userId]);

  // 2. دالة إرسال طلب السحب للخلفية
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const withdrawAmount = Number(amount);

    if (!address) return alert("الرجاء إدخال عنوان محفظة سولانا!");
    if (withdrawAmount < MIN_WITHDRAW) return alert(`الحد الأدنى للسحب هو ${MIN_WITHDRAW} عملة!`);
    if (withdrawAmount > balance) return alert("رصيدك الحالي غير كافٍ لإتمام العملية!");

    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: withdrawAmount,
          walletAddress: address,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("تم تقديم طلب السحب بنجاح وهو قيد المعالجة حالياً 🟠");
        setAmount(""); // تصفير الحقل بعد النجاح
        fetchWithdrawalData(); // إعادة تحديث الرصيد والسجلات فوراً
      } else {
        alert(data.message || "فشل في تقديم طلب السحب");
      }
    } catch (error) {
      alert("خطأ في الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  // دالة مساعدة لنسخ الـ TxHash أو العنوان بنقرة واحدة
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("تم النسخ إلى الحافظة بنجاح! 📋");
  };

  return (
    <div style={styles.container}>
      {/* بطاقة الرصيد العلوي */}
      <div style={styles.balanceCard}>
        <span style={styles.balanceLabel}>الرصيد القابل للسحب</span>
        <h1 style={styles.balanceValue}>{balance.toFixed(6)} SOLKIT</h1>
      </div>

      {/* قسم نموذج طلب السحب */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>طلب سحب جديد (Solana Network)</h2>
        <form onSubmit={handleWithdrawSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>عنوان محفظة Solana المستقبلة</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="أدخل عنوان المحفظة المكون من 32-44 حرفاً"
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>الكمية المراد سحبها</label>
            <div style={styles.amountInputWrapper}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`الحد الأدنى ${MIN_WITHDRAW}`}
                style={styles.inputAmount}
              />
              <button
                type="button"
                onClick={() => setAmount(balance.toFixed(4))}
                style={styles.maxBtn}
              >
                الحد الأقصى (Max)
              </button>
            </div>
          </div>

          {/* تفاصيل الرسوم والشبكة المسبقة */}
          <div style={styles.detailsBox}>
            <div style={styles.detailRow}>
              <span>رسوم الشبكة الافتراضية (Gas Fee):</span>
              <span style={styles.feeValue}>{GAS_FEE} SOL</span>
            </div>
            <div style={styles.detailRow}>
              <span>الحد الأدنى للسحب:</span>
              <span>{MIN_WITHDRAW} SOLKIT</span>
            </div>
          </div>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "جاري معالجة الطلب..." : "تأكيد سحب الأرباح الآن 💸"}
          </button>
        </form>
      </div>

      {/* قسم سجل العمليات التاريخي الملون */}
      <div style={styles.historyCard}>
        <h2 style={styles.cardTitle}>سجل عمليات السحب الأخير</h2>
        {history.length === 0 ? (
          <p style={styles.noHistory}>لا توجد سحوبات سابقة حتى الآن.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>الكمية</th>
                  <th style={styles.th}>التاريخ والوقت</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>مُعرف المعاملة (TxHash)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((tx) => (
                  <tr key={tx.id} style={styles.tdRow}>
                    <td style={{ ...styles.td, fontWeight: "bold", color: "#00ffcc" }}>
                      {Number(tx.amount).toFixed(2)}
                    </td>
                    <td style={styles.td}>
                      {new Date(tx.createdAt).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        ...(tx.status === "pending" && styles.statusPending),
                        ...(tx.status === "completed" && styles.statusCompleted),
                        ...(tx.status === "failed" && styles.statusFailed),
                      }}>
                        {tx.status === "pending" && "🟠 جاري المعالجة"}
                        {tx.status === "completed" && "🟢 مكتمل"}
                        {tx.status === "failed" && "🔴 مرفوض"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {tx.txHash ? (
                        <button
                          onClick={() => handleCopy(tx.txHash!)}
                          style={styles.copyHashBtn}
                        >
                          {tx.txHash.substring(0, 8)}...{tx.txHash.substring(tx.txHash.length - 8)} 📋
                        </button>
                      ) : (
                        <span style={{ color: "#a1a7bb", fontSize: "12px" }}>لم يصدر بعد</span>
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

// ==========================================
// 🎨 التنسيق البصري الاحترافي المظلم المتناسق
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#0c0d14",
    color: "#ffffff",
    fontFamily: "sans-serif",
    padding: "40px 20px",
    minHeight: "100vh",
    direction: "rtl", // لتنسيق الواجهة باللغة العربية بشكل سليم
  },
  balanceCard: {
    backgroundColor: "#171924",
    borderRadius: "16px",
    padding: "20px",
    textAlign: "center",
    width: "100%",
    maxWidth: "600px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    marginBottom: "24px",
  },
  balanceLabel: {
    color: "#a1a7bb",
    fontSize: "14px",
  },
  balanceValue: {
    color: "#00ffcc",
    margin: "10px 0 0 0",
    fontSize: "32px",
  },
  card: {
    backgroundColor: "#171924",
    borderRadius: "16px",
    padding: "30px",
    width: "100%",
    maxWidth: "600px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    marginBottom: "24px",
  },
  cardTitle: {
    fontSize: "18px",
    margin: "0 0 20px 0",
    color: "#ffffff",
    borderBottom: "1px solid #222531",
    paddingBottom: "10px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    color: "#a1a7bb",
    fontSize: "14px",
  },
  input: {
    backgroundColor: "#1f2235",
    border: "1px solid #2d314d",
    borderRadius: "10px",
    padding: "14px",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
  },
  amountInputWrapper: {
    display: "flex",
    position: "relative",
    alignItems: "center",
  },
  inputAmount: {
    backgroundColor: "#1f2235",
    border: "1px solid #2d314d",
    borderRadius: "10px",
    padding: "14px",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    width: "100%",
    paddingLeft: "100px", // ترك مساحة لزر الحد الأقصى باليسار
  },
  maxBtn: {
    position: "absolute",
    left: "10px",
    backgroundColor: "rgba(0, 255, 204, 0.1)",
    border: "1px solid #00ffcc",
    color: "#00ffcc",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "bold",
  },
  detailsBox: {
    backgroundColor: "#1f2235",
    borderRadius: "10px",
    padding: "15px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontSize: "13px",
    color: "#a1a7bb",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  feeValue: {
    color: "#ffaa00",
  },
  submitBtn: {
    backgroundColor: "#00ffcc",
    color: "#0c0d14",
    border: "none",
    borderRadius: "10px",
    padding: "16px",
    fontWeight: "bold",
    fontSize: "16px",
    cursor: "pointer",
    boxShadow: "0 4px 15px rgba(0, 255, 204, 0.3)",
  },
  historyCard: {
    backgroundColor: "#171924",
    borderRadius: "16px",
    padding: "30px",
    width: "100%",
    maxWidth: "600px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
  },
  noHistory: {
    color: "#a1a7bb",
    textAlign: "center",
    fontSize: "14px",
    margin: "20px 0",
  },
  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "right",
    fontSize: "13px",
  },

  thRow: {
   borderBottom: "2px solid #2d314d",
  },
  th: {
   color: "#a1a7bb",
   padding: "12px 8px",
   fontWeight: "normal",
  },
  tdRow: {
   borderBottom: "1px solid #222531"
  },
  td: {
   padding: "14px 8px",
   color: "#ffffff",
  },
  statusBadge: {
   padding: "4px",
   borderRadius: "4px",
   fontSize: "12px",
   fontWeight: "bold",
   display: "inline-block",
  },
}