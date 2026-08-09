import React, { useState, useEffect } from "react";
import ConnectWalletPage from "./pages/ConnectWalletPage";
import MiningDashboard from "./pages/MiningDashboard";
import ReferralPage from "./pages/ReferralPage";
import TasksPage from "./pages/TasksPage";
import BonusPage from "./pages/MiningDashboard";
import AdminPanelPage from "./pages/AdminPanelPage";
import WithdrawalPage from "./pages/WithdrawalPage";
import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";

const ADMIN_WALLET = "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

export default function App() {
  const [session, setSession] = useState<{
    userId: number;
    walletAddress: string;
    jwtToken?: string;
    role?: string;
    activationStatus?: string;
  } | null>(null);
  
  const [activeTab, setActiveTab] = useState<string>("mining");
  const [payLoading, setPayLoading] = useState<boolean>(false);
  // ✅ تأكد من كتابة اسم الدالة بالـ L الصغيرة لتطابق استدعاء الزر بالأسفل تماماً
  const handleLogout = () => {
    localStorage.clear();
    setSession(null);
    setActiveTab("mining");
  };

  const parseJwt = (token: string) => {
    try {
      if (!token) return null;
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(jsonPayload);
    } catch { return null; }
  };

  useEffect(() => {
    const savedJwt = localStorage.getItem("solkit_token");
    const savedWallet = localStorage.getItem("solkit_wallet");
    const savedRole = localStorage.getItem("solkit_role");
    const savedStatus = localStorage.getItem("solkit_status");

    if (savedJwt && savedWallet) {
      const payload = parseJwt(savedJwt);
      const resolvedUserId = payload?.id || payload?.userId || 0;

      if (resolvedUserId > 0) {
        setSession({
          userId: Number(resolvedUserId),
          walletAddress: savedWallet,
          jwtToken: savedJwt,
          role: savedRole ?? "user",
          activationStatus: savedStatus ?? "inactive"
        });
      }
    }
  }, []);

  // ابحث عن دالة handleWalletConnected وقم بتحديثها لتصبح هكذا بدقة:
  const handleWalletConnected = (jwtToken: string, walletAddress: string, role: string, activationStatus: string) => {
    localStorage.setItem("solkit_token", jwtToken); 
    localStorage.setItem("solkit_wallet", walletAddress);
    localStorage.setItem("solkit_role", role);
    localStorage.setItem("solkit_status", activationStatus); // تثبيت الحالة الحقيقية القادمة من السيرفر (active)

    const payload = parseJwt(jwtToken);
    const resolvedUserId = payload?.id || payload?.userId || 0;

    setSession({
      userId: Number(resolvedUserId),
      walletAddress,
      jwtToken,
      role,
      activationStatus: activationStatus // 🟢 تحديث فوري للجلسة لعرض لوحة التعدين مباشرة دون تراجع
    });
  };
  const handlePaymentActivation = async () => {
    if (!session?.jwtToken) return;
    const provider = (window as any).solana;

    if (!provider || !provider.isPhantom) {
      alert("الرجاء التأكد من تثبيت محفظة Phantom وتسجيل الدخول إليها أولاً!");
      return;
    }

    try {
      setPayLoading(true);

      // 1. الاتصال المباشر بعقدة سولانا الرسمية لبيئة التطوير (Devnet)
      const connection = new Connection("https://solana.com", "confirmed");
      
      const siteAdminPublicKey = new PublicKey("4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo");
      const userPublicKey = new PublicKey(provider.publicKey.toString());

      // 2. جلب بيانات السجل الحية لمعرفة محفظة الـ Referrer (تعديل الـ Backticks الصحيح 🟢)
      const checkUserRes = await fetch(`/api/users/${session.userId}`, {
        headers: { "Authorization": `Bearer ${session.jwtToken}` }
      });
      
      let referrerWalletAddress: string | null = null;
      if (checkUserRes.ok) {
        const userData = await checkUserRes.json();
        if (userData?.referrer?.walletAddress) {
          referrerWalletAddress = userData.referrer.walletAddress;
        }
      }

      // 3. بناء المعاملة الذكية الموحدة للتحويل
      const transaction = new Transaction();

      if (referrerWalletAddress) {
        alert("👥 تم رصد كود إحالة نشط! ستفتح محفظة Phantom الآن لتقسيم العملات حياً على البلوكشين (1$ للموقع و1$ لصاحب الدعوة)...");
        const referrerPublicKey = new PublicKey(referrerWalletAddress);

        // أ. تحويل 0.005 SOL لمدير الموقع
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: siteAdminPublicKey,
            lamports: 5000000, 
          })
        );

        // ب. تحويل 0.005 SOL مباشرة لصاحب الإحالة الحقيقي على الشبكة حياً
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: referrerPublicKey,
            lamports: 5000000, 
          })
        );
      } else {
        alert("🎯 تسجيل مباشر بدون إحالة: ستفتح محفظة Phantom لإرسال الـ 2$ (0.01 SOL) كاملة لمحفظة الموقع...");
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: userPublicKey,
            toPubkey: siteAdminPublicKey,
            lamports: 10000000, 
          })
        );
      }

      // ضبط رسوم الشبكة والـ Blockhash
      transaction.feePayer = userPublicKey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;

      // 4. استدعاء وبث المعاملة المقسمة حياً داخل محفظة فانتوم
      const { signature } = await provider.signAndSendTransaction(transaction);
      console.log("TxHash الأصلي لمعاملة التقسيم:", signature);

      alert("⏳ جاري انتظار تأكيد عملية التقسيم على كتل البلوكشين (تستغرق 3 ثوانٍ)...");
      await connection.confirmTransaction(signature, "confirmed");

      // 5. إرسال التوقيع النهائي للسيرفر لتفعيل الحساب بالـ MySQL
      const res = await fetch("/api/users/activate-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.jwtToken}`
        },
        body: JSON.stringify({ txHash: signature })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || "تم تفعيل حسابك بنجاح وتقسيم العملات حياً على البلوكشين! 🎉");
        localStorage.setItem("solkit_status", "active");
        setSession(prev => prev ? { ...prev, activationStatus: "active" } : null);
      } else {
        alert(data.message || "رفض السيرفر توثيق المعاملة");
      }
    } catch (error: any) {
      console.error("Solana Split Failed:", error);
      alert(error?.message || "تم إلغاء عملية الدفع والتقسيم من قبلك داخل محفظة فانتوم.");
    } finally {
      setPayLoading(false);
    }
  };


    // ابحث عن شرط عدم وجود السيسشن واستبدله بهذا السطر المكتمل والمطابق لـ Props:
  if (!session) {
    return (
      <ConnectWalletPage 
        onWalletConnected={(t, w, r, s) => handleWalletConnected(t, w, r, s || "inactive")} 
      />
    );
  }


  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <span style={styles.headerTitle}>SOLKIT SYSTEM 💎</span>
        <button onClick={handleLogout} style={styles.logoutBtn}>خروج 🚪</button>
      </header>

      {session.activationStatus !== "active" ? (
        <div style={styles.payWrapper}>
          <div style={styles.payCard}>
            <h2 style={{ color: "#ffaa00", margin: 0, fontSize: "22px" }}>⚠️ حسابك غير نشط حالياً</h2>
            <p style={{ color: "#a1a7bb", fontSize: "14px", margin: "15px 0 25px 0", lineHeight: "1.6" }}>
              لبدء سحوبات سولانا وتشغيل عدادات التعدين الحية، يجب تفعيل الحساب بدفع رسوم التسجيل لمرة واحدة بقيمة <strong>2$ SOL</strong>.
            </p>
            <button onClick={handlePaymentActivation} disabled={payLoading} style={styles.payBtn}>
              تأكيد الدفع والتفعيل الفوري لـ 2$ 🦊
            </button>
          </div>
        </div>
      ) : (
        <>
                {/* ⚡ منطقة المحتوى المتغيرة المصلحة التي تقوم باستدعاء كافة الصفحات بالتوكن الحقيقي الفعال */}
      <main style={styles.mainContent}>
         {activeTab === "mining" && <MiningDashboard userId={session.userId} token={session.jwtToken || ""} />}
         {activeTab === "withdraw" && <WithdrawalPage userId={session.userId} token={session.jwtToken || ""} />}
         
         {/* 🔗 تفعل السطر البرمجي المفقود لاستدعاء واجهة شبكة الإحالة الفاخرة */}
         {activeTab === "referral" && <ReferralPage userId={session.userId} token={session.jwtToken || ""} />}
         
         {/* 🎁 استدعاء واجهة المهمات الاجتماعية وقفل الهدايا */}
         {activeTab === "tasks" && <TasksPage userId={session.userId} token={session.jwtToken || ""} />}
         
         {/* 📅 استدعاء واجهة البونص اليومي ومتصاعد الـ XP */}
         {activeTab === "bonus" && <BonusPage userId={session.userId} token={session.jwtToken || ""} />}
         
         {/* 👑 لوحة إدارة النظام الرئيسية العليا المحمية */}
         {activeTab === "admin" && session.walletAddress === ADMIN_WALLET && <AdminPanelPage token={session.jwtToken || ""} />}
      </main>


                {/* 🧭 شريط التنقل السفلي الديناميكي المطور والمحمي لكافة واجهات النظام الخمس */}
      <nav style={styles.bottomNav}>
        
        {/* 👑 1. زر لوحة الإدارة الفاخر: يظهر شرطياً ومخفياً فقط للمسؤول الفعلي حماية للموقع */}
        {session.walletAddress === ADMIN_WALLET && (
          <button 
            onClick={() => setActiveTab("admin")} 
            style={{ ...styles.navItem, color: activeTab === "admin" ? "#ffaa00" : "#a1a7bb" }}
          >
            <span style={styles.navIcon}>👑</span>
            <span style={styles.navText}>الإدارة</span>
          </button>
        )}

        {/* ⛏️ 2. زر عداد التعدين الرئيسي */}
        <button 
          onClick={() => setActiveTab("mining")} 
          style={{ ...styles.navItem, color: activeTab === "mining" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>⛏️</span>
          <span style={styles.navText}>التعدين</span>
        </button>

        {/* 💸 3. زر سحب الأرباح وشبكة سولانا */}
        <button 
          onClick={() => setActiveTab("withdraw")} 
          style={{ ...styles.navItem, color: activeTab === "withdraw" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>💸</span>
          <span style={styles.navText}>السحب</span>
        </button>

        {/* 🔗 4. زر شبكة الإحالة وقائمة الأعضاء */}
        <button 
          onClick={() => setActiveTab("referral")} 
          style={{ ...styles.navItem, color: activeTab === "referral" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>🔗</span>
          <span style={styles.navText}>الإحالات</span>
        </button>

        {/* 🎁 5. زر المهمات الاجتماعية وقفل الهدايا */}
        <button 
          onClick={() => setActiveTab("tasks")} 
          style={{ ...styles.navItem, color: activeTab === "tasks" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>🎁</span>
          <span style={styles.navText}>المهمات</span>
        </button>

        {/* 📅 6. زر البونص اليومي وسلسلة مستويات الـ XP */}
        <button 
          onClick={() => setActiveTab("bonus")} 
          style={{ ...styles.navItem, color: activeTab === "bonus" ? "#00ffcc" : "#a1a7bb" }}
        >
          <span style={styles.navIcon}>📅</span>
          <span style={styles.navText}>البونص</span>
        </button>

      </nav>

        </>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  appContainer: { display: "flex", flexDirection: "column", backgroundColor: "#0c0d14", minHeight: "100vh", color: "#ffffff", fontFamily: "sans-serif", direction: "rtl" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", backgroundColor: "#171924", borderBottom: "1px solid #222531" },
  headerTitle: { fontSize: "18px", fontWeight: "bold", color: "#00ffcc" },
  logoutBtn: { padding: "6px 12px", backgroundColor: "rgba(255, 77, 77, 0.1)", border: "1px solid #ff4d4d", color: "#ff4d4d", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" },
  mainContent: { flex: 1, paddingBottom: "90px" },
  payWrapper: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: "40px 20px" },
  payCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "35px", maxWidth: "500px", width: "100%", textAlign: "center" },
  payBtn: { width: "100%", padding: "16px", backgroundColor: "#512da8", color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "bold", cursor: "pointer" },
  bottomNav: { display: "flex", position: "fixed", bottom: 0, left: 0, right: 0, height: "70px", backgroundColor: "#171924", borderTop: "1px solid #222531", zIndex: 1000, justifyContent: "space-around" },
  navItem: {display: "flex", backgroundColor: "transparent", border: "none", color: "#a1a7bb", cursor: "pointer", fontSize: "14px", fontWeight: "bold",flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    gap: "4px",
    flex: 1,
   },
  navIcon: {
    fontSize: "20px", // حجم الأيقونة التعبيرية
  },
  navText: {
    fontSize: "11px", // حجم نص التبويب بالأسفل
    fontWeight: "500",
  }

};
