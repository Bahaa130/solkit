import React, { useState, useEffect } from "react";
import ConnectWalletPage from "./pages/ConnectWalletPage";
import MiningDashboard from "./pages/MiningDashboard";
import WithdrawalPage from "./pages/WithdrawalPage";
import ReferralPage from "./pages/ReferralPage";
import TasksPage from "./pages/TasksPage";
import BonusPage from "./pages/BonusPage";
import AdminPanelPage from "./pages/AdminPanelPage";

export default function App() {
  const [session, setSession] = useState<{
    userId: number;
    walletAddress: string;
    jwtToken?: string;
    role?: string;
  } | null>(null);
  
  const [activeTab, setActiveTab] = useState<string>("mining");

  // ✅ تصحيح دالة تفكيك التوكين الفولاذية وإعادة الحقل [1] لمنع الـ JSON Crash
  const parseJwt = (token: string) => {
    try {
      if (!token) return null;
      const base64Url = token.split('.')[1]; // إرجاع القيمة المفقودة [1] بدقة
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%'+('00'+c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const savedJwt = localStorage.getItem("solkit_token");
    const savedWallet = localStorage.getItem("solkit_wallet");
    const savedRole = localStorage.getItem("solkit_role");

    if (savedJwt && savedWallet) {
      const payload = parseJwt(savedJwt);
      const resolvedUserId = payload?.id || payload?.userId || 0;

      if (resolvedUserId > 0) {
        setSession({
          userId: Number(resolvedUserId),
          walletAddress: savedWallet,
          jwtToken: savedJwt,
          role: savedRole ?? "user",
        });
      } else {
        // إذا كان التوكن تالفاً أو فارغاً، نقوم بمسحه لطلب تسجيل جديد
        localStorage.clear();
      }
    }
  }, []);

  const handleWalletConnected = (jwtToken: string, walletAddress: string, role: string) => {
    localStorage.setItem("solkit_token", jwtToken);
    localStorage.setItem("solkit_wallet", walletAddress);
    localStorage.setItem("solkit_role", role);

    const payload = parseJwt(jwtToken);
    const resolvedUserId = payload?.id || payload?.userId || 0;

    setSession({
      userId: Number(resolvedUserId),
      walletAddress,
      jwtToken,
      role,
    });
  };

  const handleLogout = () => {
    localStorage.clear();
    setSession(null);
    setActiveTab("mining");
  };

  // المحفظة الإدارية الصارمة الخاصة بك
  const ADMIN_WALLET = "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

  if (!session) {
    return <ConnectWalletPage onWalletConnected={handleWalletConnected} />;
  }

  return (
    <div style={styles.appContainer}>
      
      <header style={styles.header}>
        <span style={styles.headerTitle}>SOLKIT SYSTEM 💎</span>
        <button onClick={handleLogout} style={styles.logoutBtn}>خروج 🚪</button>
      </header>

      <main style={styles.mainContent}>
         {activeTab === "mining" && <MiningDashboard />}
         {activeTab === "withdraw" && <WithdrawalPage userId={session.userId} />}
         {activeTab === "referral" && <ReferralPage userId={session.userId} />}
         {activeTab === "tasks" && <TasksPage userId={session.userId} />}
         {activeTab === "bonus" && <BonusPage userId={session.userId} />}
         
         {activeTab === "admin" && session.walletAddress === ADMIN_WALLET && <AdminPanelPage />}
      </main>

      <nav style={styles.bottomNav}>
        {session.walletAddress === ADMIN_WALLET && (
          <button 
            onClick={() => setActiveTab("admin")} 
            style={{ ...styles.navItem, color: activeTab === "admin" ? "#ffaa00" : "#a1a7bb" }}
          >
            <span style={styles.navIcon}>👑</span>
            <span style={styles.navText}>الإدارة</span>
          </button>
        )}

        <button 
          onClick={() => setActiveTab("mining")} 
          style={{ ...styles.navItem, color: activeTab === "mining" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>⛏️</span>
          <span style={styles.navText}>التعدين</span>
        </button>

        <button 
          onClick={() => setActiveTab("withdraw")} 
          style={{ ...styles.navItem, color: activeTab === "withdraw" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>💸</span>
          <span style={styles.navText}>السحب</span>
        </button>

        <button 
          onClick={() => setActiveTab("referral")} 
          style={{ ...styles.navItem, color: activeTab === "referral" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>🔗</span>
          <span style={styles.navText}>الإحالات</span>
        </button>

        <button 
          onClick={() => setActiveTab("tasks")} 
          style={{ ...styles.navItem, color: activeTab === "tasks" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>🎁</span>
          <span style={styles.navText}>المهمات</span>
        </button>

        <button 
          onClick={() => setActiveTab("bonus")} 
          style={{ ...styles.navItem, color: activeTab === "bonus" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>📅</span>
          <span style={styles.navText}>البونص</span>
        </button>
      </nav>

    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: { display: "flex", flexDirection: "column", backgroundColor: "#0c0d14", minHeight: "100vh", color: "#ffffff", fontFamily: "sans-serif", direction: "rtl" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", backgroundColor: "#171924", borderBottom: "1px solid #222531", position: "sticky", top: 0, zIndex: 100 },
  headerTitle: { fontSize: "18px", fontWeight: "bold", color: "#00ffcc" },
  logoutBtn: { padding: "6px 12px", backgroundColor: "rgba(255, 77, 77, 0.1)", border: "1px solid #ff4d4d", color: "#ff4d4d", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" },
  mainContent: { flex: 1, paddingBottom: "90px" },
  bottomNav: { display: "flex", justifyContent: "space-around", alignItems: "center", position: "fixed", bottom: 0, left: 0, right: 0, height: "70px", backgroundColor: "#171924", borderTop: "1px solid #222531", boxShadow: "0 -5px 20px rgba(0,0,0,0.4)", zIndex: 1000 },
  navItem: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer", transition: "all 0.2s ease", gap: "4px", flex: 1 },
  navIcon: { fontSize: "20px" },
  navText: { fontSize: "12px", fontWeight: "500" }
};
