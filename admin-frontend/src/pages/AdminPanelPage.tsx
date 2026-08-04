import React, { useState, useEffect } from "react";

// ⚠️ تأكد من وضع عنوان محفظتك الشخصية الحقيقية هنا متطابقاً تماماً
const ADMIN_WALLET = "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

interface AdminStats {
  totalUsers: number;
  activeMiners: number;
  pendingWithdrawals: number;
  totalRevenue: number;
}

interface PendingWithdrawal {
  id: number;
  amount: string | number;
  walletAddress: string;
  createdAt: string;
  user: {
    email: string;
  };
}

export default function AdminPanelPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingList, setPendingList] = useState<PendingWithdrawal[]>([]);
  const [txHashes, setTxHashes] = useState<{ [key: number]: string }>({});
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. دالة جلب البيانات والإحصائيات وتمرير الهيدر الأمني للـ Admin
  const fetchAdminData = async () => {
    try {
      setErrorMessage(null);
      const headers = { 
        "Content-Type": "application/json",
        "admin-wallet": ADMIN_WALLET 
      };

      // جلب الإحصائيات العامة
      const statsRes = await fetch("/api/users/admin/stats", { headers });
      if (!statsRes.ok) {
        const errData = await statsRes.json();
        setErrorMessage(errData.message || "فشل التحقق من صلاحيات المدير");
        return;
      }
      const statsData = await statsRes.json();

      // جلب قائمة طلبات السحب
      const listRes = await fetch("/api/users/admin/pending-withdrawals", { headers });
      if (!listRes.ok) {
        setErrorMessage("فشل جلب قائمة سحوبات شبكة سولانا");
        return;
      }
      const listData = await listRes.json();

      // تحديث الواجهة فور نجاح العملية بالبيانات المستقرة
      setStats(statsData);
      setPendingList(listData);

    } catch (error) {
      console.error("Error loading admin dashboard:", error);
      setErrorMessage("خطأ في الاتصال بالخادم، تأكد من تشغيل الـ Backend");
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // 2. دالة اتخاذ القرار للمدير (موافقة مع التحقق من الهاش أو الرفض المطلق)
  const handleAction = async (id: number, status: "completed" | "failed") => {
    const hash = txHashes[id];
    if (status === "completed" && !hash) {
      return alert("الرجاء إدخال الـ Transaction Signature (TxHash) لتأكيد المعاملة برمجياً!");
    }

    try {
      setProcessingId(id);
      const headers = { 
        "Content-Type": "application/json",
        "admin-wallet": ADMIN_WALLET 
      };

      const res = await fetch(`/api/users/admin/process-withdrawal/${id}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ status, txHash: hash || null }),
      });

      if (res.ok) {
        alert(status === "completed" ? "🟢 تم تأكيد عملية السحب بنجاح!" : "🔴 تم رفض الطلب بنجاح.");
        // تصفير حقل الهاش الخاص بهذه المعاملة فقط بعد النجاح
        setTxHashes(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
        fetchAdminData(); // تحديث اللوحة والإحصائيات حياً
      } else {
        const errData = await res.json();
        alert(errData.message || "فشل في تحديث حالة السحب");
      }
    } catch (error) {
      alert("خطأ في الاتصال بالسيرفر أثناء تحديث الحالة");
    } finally {
      setProcessingId(null);
    }
  };

  // عرض الخطأ بشكل مرئي وصريح في حال وجود تضارب في الصلاحيات والمحفظة
  if (errorMessage) {
    return (
      <div style={{ color: "#ff4d4d", textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>
        <h2>⚠️ خطأ في الدخول</h2>
        <p>{errorMessage}</p>
        <button onClick={fetchAdminData} style={{ marginTop: "15px", padding: "10px 20px", backgroundColor: "#00ffcc", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}>إعادة المحاولة</button>
      </div>
    );
  }

  // وضع جاري التحميل المؤقت
  if (!stats) return <div style={{ color: "#fff", textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>جاري تحميل لوحة التحكم للمدير...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>👑 لوحة إدارة النظام الرئيسية (Admin)</h1>
        <p style={styles.subtitle}>متابعة المؤشرات المالية، عدد المعدنين، والموافقة على عمليات سحب شبكة سولانا.</p>
      </div>

      {/* لوحة المؤشرات الرقمية العامة للتطبيق */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>إجمالي إيرادات التفعيل</span>
          <h2 style={{ ...styles.statValue, color: "#ffaa00" }}>${stats.totalRevenue}</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>إجمالي المشتركين</span>
          <h2 style={styles.statValue}>{stats.totalUsers} حساب</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>المعدنين النشطين الآن</span>
          <h2 style={{ ...styles.statValue, color: "#00ffcc" }}>{stats.activeMiners} مُعدّن</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>طلبات السحب المعلقة</span>
          <h2 style={{ ...styles.statValue, color: "#ff4d4d" }}>{stats.pendingWithdrawals} طلب</h2>
        </div>
      </div>

      {/* إدارة طلبات سحب الأرباح وشبكة سولانا */}
      <div style={styles.tableCard}>
        <h3 style={styles.cardTitle}>طلبات سحب العملات المعلقة (🟠 قيد الانتظار)</h3>
        {pendingList.length === 0 ? (
          <p style={styles.noData}>ممتاز! لا توجد أي طلبات سحب معلقة حالياً.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>المستخدم</th>
                  <th style={styles.th}>الكمية المطلوبة</th>
                  <th style={styles.th}>محفظة Solana المستقبلة</th>
                  <th style={styles.th}>إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map((req) => (
                  <tr key={req.id} style={styles.tdRow}>
                    <td style={styles.td}>{req.user?.email || "مستخدم مجهول"}</td>
                    <td style={{ ...styles.td, color: "#00ffcc", fontWeight: "bold" }}>{Number(req.amount).toFixed(2)}</td>
                    <td style={styles.td} title={req.walletAddress}>
                      {req.walletAddress.substring(0, 6)}...{req.walletAddress.substring(req.walletAddress.length - 6)}
                    </td>
                    <td style={styles.tdActions}>
                      <input
                        type="text"
                        placeholder="أدخل Tx Signature بعد التحويل"
                        value={txHashes[req.id] || ""}
                        onChange={(e) => setTxHashes({ ...txHashes, [req.id]: e.target.value })}
                        style={styles.inputHash}
                      />
                      <button
                        onClick={() => handleAction(req.id, "completed")}
                        disabled={processingId === req.id}
                        style={styles.approveBtn}
                      >
                        موافقة 🟢
                      </button>
                      <button
                        onClick={() => handleAction(req.id, "failed")}
                        disabled={processingId === req.id}
                        style={styles.rejectBtn}
                      >
                        رفض 🔴
                      </button>
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
// 🎨 واجهة التنسيق اللوني والجمالي المظلم لـ CSS
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: "20px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "900px", margin: "0 auto", direction: "rtl", fontFamily: "sans-serif" },
  headerBox: { textAlign: "center", marginBottom: "10px" },
  title: { fontSize: "24px", color: "#ffffff", margin: 0 },
  subtitle: { color: "#a1a7bb", fontSize: "13px", marginTop: "5px" },
  statsGrid: { display: "flex", gap: "15px", justifyContent: "space-between", flexWrap: "wrap" },
  statCard: { backgroundColor: "#171924", borderRadius: "12px", padding: "20px", flex: 1, minWidth: "180px", textAlign: "center", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  statLabel: { color: "#a1a7bb", fontSize: "13px" },
  statValue: { margin: "10px 0 0 0", fontSize: "24px", color: "#fff", fontWeight: "bold" },
  tableCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  cardTitle: { fontSize: "16px", color: "#fff", margin: "0 0 15px 0", borderBottom: "1px solid #222531", paddingBottom: "10px" },
  noData: { color: "#00ff77", textAlign: "center", fontSize: "14px", margin: "20px 0", fontWeight: "bold" },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: "13px" },
  thRow: { borderBottom: "2px solid #2d314d" },
  th: { color: "#a1a7bb", padding: "12px 8px", fontWeight: "normal" },
  tdRow: { borderBottom: "1px solid #222531" },
  td: { padding: "14px 8px", color: "#fff" },
  tdActions: { padding: "14px 8px", display: "flex", gap: "8px", alignItems: "center" },
  inputHash: { backgroundColor: "#1f2235", border: "1px solid #2d314d", borderRadius: "6px", padding: "8px", color: "#fff", fontSize: "12px", outline: "none", width: "160px" },
  approveBtn: { backgroundColor: "rgba(0, 255, 119, 0.15)", border: "1px solid #00ff77", color: "#00ff77", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" },
  rejectBtn: { backgroundColor: "rgba(255, 77, 77, 0.15)", border: "1px solid #ff4d4d", color: "#ff4d4d", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }
};