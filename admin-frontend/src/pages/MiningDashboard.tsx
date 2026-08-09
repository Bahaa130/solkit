import React, { useState, useEffect } from "react";

interface MiningDashboardProps {
  userId: number;
  token: string;
}

export default function MiningDashboard({ userId, token }: MiningDashboardProps) {
  const [balance, setBalance] = useState<number>(0.0);
  const [level, setLevel] = useState<number>(1);
  const [miningStatus, setMiningStatus] = useState({ status: "stopped", miningRate: 0.5, timeLeft: 0, pendingMinedAmount: 0 });

  const fetchDashboardData = async () => {
    if (!token || !userId) return;
    try {
      let currentBaseBalance = 0;

      // 1. جلب رصيد المستخدم الأساسي من السيرفر مع تمرير توكن الحماية
      const userRes = await fetch(`/api/users/${userId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (userRes.ok) {
        const textData = await userRes.text();
        if (textData) {
          const userData = JSON.parse(textData);
          currentBaseBalance = Number(userData.balance || 0);
          setLevel(Number(userData.currentLevel || 1));
        }
      }

      // 2. جلب تفاصيل التعدين الحية الحالية والوقت وفارق الثواني
      const miningRes = await fetch("/api/users/mining-status", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (miningRes.ok) {
        const miningText = await miningRes.text();
        if (miningText) {
          const miningData = JSON.parse(miningText);
          setMiningStatus(miningData);
          
          // ⭐ السر الجوهري: دمج الرصيد الأساسي المخزن + الأرباح المعلقة المستخرجة بالثواني فوراً عند تحديث الصفحة لمنع تراجع الرصيد
          const liveMinedAmount = Number(miningData.pendingMinedAmount || 0);
          setBalance(currentBaseBalance + liveMinedAmount);
        }
      }
    } catch (error) {
      console.error("Error fetching mining status safely:", error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000); // فحص خلفي كل دقيقة للمزامنة الكلية
    return () => clearInterval(interval);
  }, [userId, token]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (miningStatus.status === "active" && miningStatus.timeLeft > 0) {
      timer = setInterval(() => {
        setMiningStatus((prev) => {
          if (prev.timeLeft <= 1) {
            clearInterval(timer);
            fetchDashboardData();
            return { ...prev, status: "stopped", timeLeft: 0, pendingMinedAmount: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
        // تحديث وتصاعد حركي حي للأرقام العشرية الدقيقة أمام عين العميل كل ثانية
        setBalance((prev) => prev + (Number(miningStatus.miningRate) / 3600));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [miningStatus.status, miningStatus.timeLeft]);

  const handleStartMining = async () => {
    try {
      const res = await fetch("/api/users/mining-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) fetchDashboardData();
    } catch {
      alert("خطأ في الاتصال بالخادم لم يبدأ التعدين");
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const percentage = miningStatus.status === "active" ? ((86400 - miningStatus.timeLeft) / 86400) * 100 : 0;

  return (
    <div style={styles.container}>
      <div style={styles.badgeLevel}>🥈 رتبة حسابك الحالية: مستوى {level}</div>
      <div style={styles.balanceCard}>
        <span style={styles.balanceLabel}>إجمالي الرصيد المعدّن الموثق</span>
        <h1 style={styles.balanceValue}>{balance.toFixed(8)} SOLKIT</h1>
      </div>

      <div style={styles.miningCircleContainer}>
        <div style={{ ...styles.circularProgressBar, background: `conic-gradient(#00ffcc ${percentage}%, #171924 0)` }}>
          <div style={styles.innerCircle}>
            {miningStatus.status === "active" ? (
              <>
                <span style={styles.timerText}>{formatTime(miningStatus.timeLeft)}</span>
                <span style={styles.rateText}>+{Number(miningStatus.miningRate).toFixed(4)} عملة / ساعة</span>
              </>
            ) : (
              <span style={styles.stoppedText}>جاهز للتعدين</span>
            )}
          </div>
        </div>
      </div>

      <button onClick={handleStartMining} disabled={miningStatus.status === "active"} style={{
        ...styles.miningButton,
        backgroundColor: miningStatus.status === "active" ? "#222531" : "#00ffcc",
        color: miningStatus.status === "active" ? "#a1a7bb" : "#0c0d14",
        cursor: miningStatus.status === "active" ? "not-allowed" : "pointer"
      }}>
        {miningStatus.status === "active" ? "⚡ جلسة التعدين الحية نشطة حالياً" : "إطلاق عداد التعدين (24 ساعة) 🚀"}
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", backgroundColor: "#0c0d14", minHeight: "100vh", color: "#fff", direction: "rtl", fontFamily: "sans-serif" },
  badgeLevel: { backgroundColor: "rgba(0, 255, 204, 0.1)", color: "#00ffcc", padding: "8px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: "bold", marginBottom: "20px", border: "1px solid rgba(0, 255, 204, 0.2)" },
  balanceCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", textAlign: "center", marginBottom: "40px", width: "100%", maxWidth: "420px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
  balanceLabel: { color: "#a1a7bb", fontSize: "13px", display: "block", marginBottom: "8px" },
  balanceValue: { color: "#00ffcc", fontSize: "28px", margin: 0, fontWeight: "bold", letterSpacing: "0.5px" },
  miningCircleContainer: { marginBottom: "40px" },
  circularProgressBar: { width: "230px", height: "230px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 25px rgba(0, 255, 204, 0.15)", transition: "background 0.5s ease" },
  innerCircle: { width: "200px", height: "200px", backgroundColor: "#0c0d14", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  timerText: { fontSize: "32px", fontWeight: "bold", color: "#fff", letterSpacing: "1px" },
  rateText: { fontSize: "11px", color: "#00ffcc", marginTop: "8px", fontWeight: "bold" },
  stoppedText: { fontSize: "18px", color: "#a1a7bb", fontWeight: "bold" },
  miningButton: { width: "100%", maxWidth: "420px", padding: "16px", border: "none", borderRadius: "12px", fontSize: "15px", fontWeight: "bold", transition: "all 0.3s ease", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" }
};
