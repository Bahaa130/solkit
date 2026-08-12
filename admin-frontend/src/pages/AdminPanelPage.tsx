import React, { useState, useEffect } from "react";
import { C, font, styles as T } from "../theme";
import DistributionPanel from "../components/DistributionPanel";
import CommunityTasksPanel from "../components/CommunityTasksPanel";
import { useToast } from "../components/Toast";

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

// قمنا بتحديث المكون ليستقبل الـ token حياً من الأب الموثق 🛡️
export default function AdminPanelPage({ token }: { token: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingList, setPendingList] = useState<PendingWithdrawal[]>([]);
  const [txHashes, setTxHashes] = useState<{ [key: number]: string }>({});
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<"general" | "distribution" | "tasks">("general");
  const toast = useToast();

  // 1. دالة جلب البيانات والإحصائيات وتمرير التوكن الرسمي الصارم بـ Bearer JWT
  const fetchAdminData = async () => {
    if (!token) {
      setErrorMessage("عذراً، يجب تسجيل الدخول أولاً كمسؤول!");
      return;
    }

    try {
      setErrorMessage(null);
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` // تمرير التوكن المشفر المعتمد بدلاً من الهيدر البدائي القديم 🔐
      };

      // جلب الإحصائيات العامة من السيرفر الفولاذي
      const statsRes = await fetch("/api/users/admin/stats", { headers });

      if (statsRes.status === 401 || statsRes.status === 403) {
        setErrorMessage("عذراً، جلسة العمل منتهية أو حسابك لا يمتلك صلاحية المسؤول العليا!");
        return;
      }

      if (!statsRes.ok) {
        setErrorMessage("فشل السيرفر في معالجة طلب الإدارة الحية");
        return;
      }
      const statsData = await statsRes.json();

      // جلب قائمة طلبات السحب المعلقة
      const listRes = await fetch("/api/users/admin/pending-withdrawals", { headers });
      if (!listRes.ok) {
        setErrorMessage("فشل جلب قائمة سحوبات شبكة سولانا المعلقة");
        return;
      }
      const listData = await listRes.json();

      setStats(statsData);
      setPendingList(listData);

    } catch (error) {
      console.error("Error loading admin dashboard:", error);
      setErrorMessage("خطأ في الاتصال بالخادم، تأكد من تشغيل الـ Backend");
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [token]);

  // 2. دالة اتخاذ القرار للمدير (موافقة مع إدخال الهاش أو الرفض وإعادة الأموال)
  const handleAction = async (id: number, status: "completed" | "failed") => {
    const hash = txHashes[id];
    if (status === "completed" && !hash) {
      return toast.warning("الرجاء إدخال الـ Transaction Signature (TxHash) لتأكيد المعاملة برمجياً!");
    }

    try {
      setProcessingId(id);
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      const res = await fetch(`/api/users/admin/process-withdrawal/${id}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ status, txHash: hash || null }),
      });

      if (res.ok) {
        toast.success(status === "completed" ? "🟢 تم تأكيد عملية السحب بنجاح!" : "🔴 تم رفض الطلب وإعادة الرصيد.");
        setTxHashes(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
        fetchAdminData(); // تحديث فوري للوحة الإدارة
      } else {
        const errData = await res.json();
        toast.error(errData.message || "فشل في تحديث حالة السحب");
      }
    } catch (error) {
      toast.error("خطأ في الاتصال بالسيرفر أثناء تحديث الحالة");
    } finally {
      setProcessingId(null);
    }
  };

  if (errorMessage) {
    return (
      <div style={{ ...T.page, textAlign: "center", paddingTop: 80 }}>
        <h2 style={{ color: C.red, fontWeight: 900 }}>⚠️ خطأ في الدخول</h2>
        <p style={{ marginTop: 10, color: C.muted }}>{errorMessage}</p>
        <button onClick={fetchAdminData} className="btn btn-primary" style={{ marginTop: 20, padding: "12px 24px" }}>إعادة المحاولة 🔄</button>
      </div>
    );
  }

  if (!stats) return <div style={{ ...T.page, textAlign: "center", color: C.muted }}>جاري جلب لوحة المسؤول الآمنة...</div>;

  const statCards = [
    { label: "إجمالي إيرادات التفعيل", value: `${Number(stats.totalRevenue || 0).toFixed(3)}`, unit: "SOL", color: C.amber, icon: "💰" },
    { label: "إجمالي المشتركين", value: `${stats.totalUsers}`, unit: "حساب", color: C.text, icon: "👥" },
    { label: "المعدنين النشطين الآن", value: `${stats.activeMiners}`, unit: "مُعدّن", color: C.teal, icon: "⛏️" },
    { label: "طلبات السحب المعلقة", value: `${stats.pendingWithdrawals}`, unit: "طلب", color: C.red, icon: "🟠" },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>👑 لوحة إدارة النظام الرئيسية (Admin)</h1>
        <p style={styles.subtitle}>متابعة المؤشرات المالية، عدد المعدنين، والموافقة على عمليات سحب شبكة سولانا.</p>
      </div>

      <div style={styles.tabBar}>
        <button onClick={() => setAdminTab("general")} style={{ ...styles.tabBtn, ...(adminTab === "general" ? styles.tabActive : {}) }}>
          📊 الإدارة العامّة
        </button>
        <button onClick={() => setAdminTab("distribution")} style={{ ...styles.tabBtn, ...(adminTab === "distribution" ? styles.tabActive : {}) }}>
          🎁 توزيع الجوائز
        </button>
        <button onClick={() => setAdminTab("tasks")} style={{ ...styles.tabBtn, ...(adminTab === "tasks" ? styles.tabActive : {}) }}>
          🎯 مهام المجتمع
        </button>
      </div>

      {adminTab === "distribution" ? (
        <DistributionPanel token={token} />
      ) : adminTab === "tasks" ? (
        <CommunityTasksPanel token={token} />
      ) : (
        <>
        <div style={styles.statsGrid}>
          {statCards.map((s, i) => (
          <div key={i} className="glass" style={styles.statCard}>
            <span style={styles.statIcon}>{s.icon}</span>
            <span style={styles.statLabel}>{s.label}</span>
            <h2 style={{ ...styles.statValue, color: s.color }}>
              {s.value} <span style={{ fontSize: 12, fontWeight: 700 }}>{s.unit}</span>
            </h2>
          </div>
        ))}
      </div>

      <div className="glass" style={styles.tableCard}>
        <h3 style={styles.cardTitle}>طلبات سحب العملات المعلقة (🟠 قيد الانتظار)</h3>
        {pendingList.length === 0 ? (
          <p style={styles.noData}>ممتاز! لا توجد أي طلبات سحب معلقة حالياً. ✅</p>
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
                    <td style={{ ...styles.td, color: C.teal, fontWeight: 800 }}>{Number(req.amount).toFixed(4)}</td>
                    <td style={styles.td} title={req.walletAddress}>
                      {req.walletAddress.substring(0, 6)}...{req.walletAddress.substring(req.walletAddress.length - 6)}
                    </td>
                    <td style={styles.tdActions}>
                      <input
                        className="input"
                        type="text"
                        placeholder="أدخل Tx Signature بعد التحويل"
                        value={txHashes[req.id] || ""}
                        onChange={(e) => setTxHashes({ ...txHashes, [req.id]: e.target.value })}
                        style={{ width: 160, padding: "8px 10px", fontSize: 12 }}
                      />
                      <button onClick={() => handleAction(req.id, "completed")} disabled={processingId === req.id} className="btn btn-green" style={{ padding: "8px 14px", fontSize: 12 }}>موافقة 🟢</button>
                      <button onClick={() => handleAction(req.id, "failed")} disabled={processingId === req.id} style={{ ...styles.actionBtn, ...styles.rejectBtn }}>رفض 🔴</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
        </>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: 20, display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", direction: "rtl", fontFamily: font },
  tabBar: { display: "flex", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 6, justifyContent: "center" },
  tabBtn: { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "transparent", color: C.muted, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: font, transition: "all .2s ease" },
  tabActive: { background: "rgba(0,255,204,0.12)", color: C.teal, boxShadow: "0 0 14px rgba(0,255,204,0.12)" },
  headerBox: { textAlign: "center", marginBottom: 6 },
  title: { fontSize: 22, color: C.text, margin: 0, fontWeight: 900 },
  subtitle: { color: C.muted, fontSize: 13, marginTop: 6 },
  statsGrid: { display: "flex", gap: 15, justifyContent: "space-between", flexWrap: "wrap" },
  statCard: { borderRadius: 18, padding: 22, flex: 1, minWidth: 180, textAlign: "center" },
  statIcon: { fontSize: 22, display: "block", marginBottom: 8 },
  statLabel: { color: C.muted, fontSize: 13, display: "block" },
  statValue: { margin: "10px 0 0 0", fontSize: 22, color: C.text, fontWeight: 900 },
  tableCard: { padding: 24 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 15px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 10 },
  noData: { color: C.green, textAlign: "center", fontSize: 14, margin: "20px 0", fontWeight: 800 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "right", fontSize: 13 },
  thRow: { borderBottom: "1px solid rgba(255,255,255,0.12)" },
  th: { color: C.muted, padding: "12px 8px", fontWeight: 700 },
  tdRow: { borderBottom: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "14px 8px", color: C.text },
  tdActions: { padding: "14px 8px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  actionBtn: { borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", border: "none", fontFamily: font },
  rejectBtn: { background: "rgba(255,77,77,0.15)", border: "1px solid rgba(255,77,77,0.4)", color: "#ff4d4d" }
};
