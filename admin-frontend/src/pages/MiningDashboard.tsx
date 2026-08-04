import React, { useState, useEffect } from "react";

export default function MiningDashboard() {
  const [balance, setBalance] = useState<number>(0.0);
  const [miningStatus, setMiningStatus] = useState({ status: "stopped", miningRate: 0.5, timeLeft: 0 });
  
  // 🛡️ جلب التوكين والمُعرف المحفوظين من الـ localStorage لضمان التوثيق
  const token = localStorage.getItem("solkit_token");
  const userId = localStorage.getItem("solkit_user_id");

  // 1. دالة جلب البيانات المحمية تماماً ضد الاستجابات الفارغة من السيرفر
  const fetchDashboardData = async () => {
    if (!token || !userId) return;

    try {
      // أ. جلب رصيد المستخدم الأساسي
      const userRes = await fetch(`/api/users/${userId}`);
      if (userRes.ok && userRes.status !== 204) {
        const textData = await userRes.text(); // قراءة الاستجابة كنص أولاً لمنع الـ Unexpected end of JSON
        if (textData) {
          const userData = JSON.parse(textData);
          setBalance(Number(userData.balance || 0));
        }
      }

      // ب. جلب تفاصيل التعدين الحية (طلب محمي بتمرير توكين الـ Bearer JWT)
      const miningRes = await fetch("/api/users/mining-status", {
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        }
      });

      if (miningRes.ok && miningRes.status !== 204) {
        const miningText = await miningRes.text();
        if (miningText) {
          const miningData = JSON.parse(miningText);
          setMiningStatus(miningData);
        }
      }
    } catch (error) {
      console.error("Failed to load dashboard safely:", error);
    }
  };

  // 2. دالة بدء دورة التعدين الجديدة والمحمية بالتوكين
  const handleStartMining = async () => {
    if (!token) return;

    try {
      const res = await fetch("/api/users/mining-start", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        fetchDashboardData(); // تحديث فوري للعداد بعد التفعيل الناجح
      } else {
        const errText = await res.text();
        if (errText) {
          const errData = JSON.parse(errText);
          alert(errData.message || "فشلت عملية بدء التعدين");
        }
      }
    } catch (error) {
      alert("خطأ في الاتصال بالسيرفر، يرجى المحاولة لاحقاً.");
    }
  };

  // 3. التحديث التلقائي الدوري للبيانات عند فتح الصفحة (كل دقيقة)
  useEffect(() => {
    fetchDashboardData();
    const globalInterval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(globalInterval);
  }, []);

  // 4. تأثير العداد التنازلي التلقائي وزيادة الرصيد الحي (Live Ticking Effect) كل ثانية
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (miningStatus.status === "active" && miningStatus.timeLeft > 0) {
      timer = setInterval(() => {
        setMiningStatus((prev) => {
          if (prev.timeLeft <= 1) {
            clearInterval(timer);
            fetchDashboardData(); // إعادة المزامنة مع السيرفر فور انتهاء الـ 24 ساعة
            return { ...prev, status: "stopped", timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });

        // حركة تصاعدية حية للرصيد على شاشة المستخدم دون إرهاق السيرفر
        setBalance((prev) => prev + (miningStatus.miningRate / 3600));
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [miningStatus.status, miningStatus.timeLeft]);

  // تحويل الثواني لصيغة عرض زمنية قياسية (ساعة:دقيقة:ثانية)
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const percentage = miningStatus.status === "active" ? ((86400 - miningStatus.timeLeft) / 86400) * 100 : 0;

  return (
    <div style={styles.container}>
      <div style={styles.balanceCard}>
        <h3 style={styles.balanceLabel}>إجمالي العملات المعدنة</h3>
        <h1 style={styles.balanceValue}>{balance.toFixed(6)} SOLKIT</h1>
      </div>

      <div style={styles.miningCircleContainer}>
        <div style={{ ...styles.circularProgressBar, background: `conic-gradient(#00ffcc ${percentage}%, #222531 0)` }}>
          <div style={styles.innerCircle}>
            {miningStatus.status === "active" ? (
              <>
                <span style={styles.timerText}>{formatTime(miningStatus.timeLeft)}</span>
                <span style={styles.rateText}>{miningStatus.miningRate} Token/Hr</span>
              </>
            ) : (
              <span style={styles.stoppedText}>مستعد للتعدين</span>
            )}
          </div>
        </div>
      </div>

      <button 
        onClick={handleStartMining} 
        disabled={miningStatus.status === "active"} 
        style={{ 
          ...styles.miningButton, 
          backgroundColor: miningStatus.status === "active" ? "#3a3f50" : "#00ffcc", 
          color: miningStatus.status === "active" ? "#a1a7bb" : "#0c0d14",
          cursor: miningStatus.status === "active" ? "not-allowed" : "pointer"
        }}
      >
        {miningStatus.status === "active" ? "جاري التعدين حالياً..." : "ابدأ التعدين الآن"}
      </button>
    </div>
  );
}

// ==========================================
// 🎨 واجهة التنسيق اللوني والجمالي المظلم لـ CSS
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", backgroundColor: "#0c0d14", minHeight: "100vh", color: "#ffffff", fontFamily: "sans-serif" },
  balanceCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "20px 40px", textAlign: "center", marginBottom: "40px", width: "100%", maxWidth: "400px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
  balanceLabel: { color: "#a1a7bb", fontSize: "14px", margin: "0 0 10px 0" },
  balanceValue: { color: "#00ffcc", fontSize: "32px", margin: 0, fontWeight: "bold" },
  miningCircleContainer: { marginBottom: "40px" },
  circularProgressBar: { width: "220px", height: "220px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(0, 255, 204, 0.2)", transition: "background 0.5s ease" },
  innerCircle: { width: "190px", height: "190px", backgroundColor: "#171924", borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  timerText: { fontSize: "28px", fontWeight: "bold", letterSpacing: "1px" },
  rateText: { fontSize: "12px", color: "#00ffcc", marginTop: "5px" },
  stoppedText: { fontSize: "18px", color: "#a1a7bb", fontWeight: "bold" },
  miningButton: { width: "100%", maxWidth: "400px", padding: "16px", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "bold", transition: "all 0.3s ease", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" }
};
