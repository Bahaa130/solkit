import React, { useState, useEffect } from "react";

// مصفوفة المكافآت الثابتة للأيام السبعة المتتالية للتأثير البصري
const BONUS_TIERS = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0];
const XP_FOR_NEXT_LEVEL = 100; // الحد الأقصى للمستوى

export default function BonusPage({ userId }: { userId: number }) {
  const BACKEND_URL = `/api/users/${userId}`;

  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [currentXp, setCurrentXp] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  // 1. جلب حالة الحساب والمستويات والبونص عند فتح الصفحة
  const fetchBonusData = async () => {
    try {
      const res = await fetch(BACKEND_URL);
      if (res.ok) {
        const userData = await res.json();
        setCurrentLevel(Number(userData.currentLevel || 1));
        setCurrentXp(Number(userData.currentXp || 0));

        // فحص آخر بونص تم الحصول عليه لمعرفة السلسلة الحالية (Streak)
        const bonuses = userData.dailyBonuses || [];
        if (bonuses.length > 0) {
          // ترتيب السجلات تنازلياً للحصول على أحدث مطالبة
          const sortedBonuses = bonuses.sort((a: any, b: any) => 
            new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime()
          );
          setCurrentStreak(sortedBonuses[0].streakDay || 1);
        } else {
          setCurrentStreak(1);
        }
      }
    } catch (error) {
      console.error("Failed to load bonus tier data:", error);
    }
  };

  useEffect(() => {
    fetchBonusData();
  }, [userId]);

  // 2. دالة المطالبة بالبونص اليومي
  const handleClaimBonus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/claim-daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok) {
        alert(`🎉 تم استلام بونص اليوم المكتسب بنجاح بقيمة ${data.reward} عملة، وحصلت على +15 XP!`);
        fetchBonusData(); // إعادة التحديث لعرض شريط الـ XP والمستوى الجديد
      } else {
        alert(data.message || "لقد قمت بالمطالبة بالبونص اليومي بالفعل، عد غداً!");
      }
    } catch (error) {
      alert("خطأ في الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  // زيادة الحسبة البصرية بناءً على مستوى العميل الحالي
  const levelMultiplier = currentLevel === 2 ? 1.05 : currentLevel === 3 ? 1.10 : 1.0;

  return (
    <div style={styles.container}>
      {/* قسم عرض المستويات الـ Loyalty Tiers وشريط تقدم الـ XP */}
      <div style={styles.tierCard}>
        <div style={styles.tierHeader}>
          <div>
            <h2 style={styles.tierTitle}>المستوى الحالي: {currentLevel}</h2>
            <span style={styles.tierBadge}>
              {currentLevel === 1 && "🥉 مستوى مبتدئ (العائد الأساسي)"}
              {currentLevel === 2 && "🥈 مستوى متوسط (+5% بونص إضافي)"}
              {currentLevel === 3 && "🥇 مستوى محترف (+10% بونص إضافي)"}
            </span>
          </div>
          <span style={styles.xpNumber}>{currentXp} / {XP_FOR_NEXT_LEVEL} XP</span>
        </div>
        
        {/* شريط التقدم البصري للـ XP */}
        <div style={styles.progressContainer}>
          <div style={{ ...styles.progressBar, width: `${(currentXp / XP_FOR_NEXT_LEVEL) * 100}%` }}></div>
        </div>
        <p style={styles.xpHint}>تبقّى لك {Math.max(0, XP_FOR_NEXT_LEVEL - currentXp)} نقاط خبرة للانتقال إلى المستوى التالي وترقية الأرباح.</p>
      </div>

      {/* قسم نظام الحضور والـ Check-in اليومي المتصاعد (7 أيام) */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>سلسلة الحضور اليومي والجوائز التصاعدية</h3>
        <p style={styles.description}>قم بتسجيل حضورك يومياً على التوالي لزيادة أرباحك، في حال تفويت أي يوم سيعود العداد لليوم الأول.</p>
        
        <div style={styles.gridDays}>
          {BONUS_TIERS.map((bonus, index) => {
            const dayNumber = index + 1;
            const isCurrentDay = dayNumber === currentStreak;
            const isPassedDay = dayNumber < currentStreak;

            return (
              <div 
                key={index} 
                style={{
                  ...styles.dayBox,
                  backgroundColor: isCurrentDay ? "rgba(0, 255, 204, 0.1)" : "#1f2235",
                  border: isCurrentDay ? "1px solid #00ffcc" : "1px solid #2d314d",
                  opacity: isPassedDay ? 0.5 : 1
                }}
              >
                <span style={{ ...styles.dayName, color: isCurrentDay ? "#00ffcc" : "#a1a7bb" }}>يوم {dayNumber}</span>
                <span style={styles.dayReward}>{(bonus * levelMultiplier).toFixed(1)}</span>
                <span style={styles.tokenUnit}>عملة</span>
                {isPassedDay && <span style={styles.checkMark}>✓</span>}
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleClaimBonus} 
          disabled={loading} 
          style={styles.claimBtn}
        >
          {loading ? "جاري المطالبة..." : "المطالبة ببونص اليوم الحركي 🎁"}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 🎨 واجهة التنسيق اللوني والجمالي المتناسق
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: "20px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px", margin: "0 auto", direction: "rtl" },
  tierCard: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  tierHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "15px" },
  tierTitle: { fontSize: "18px", color: "#fff", margin: 0 },
  tierBadge: { color: "#ffaa00", fontSize: "12px", display: "block", marginTop: "5px", fontWeight: "bold" },
  xpNumber: { color: "#00ffcc", fontSize: "13px", fontWeight: "bold" },
  progressContainer: { width: "100%", height: "10px", backgroundColor: "#222531", borderRadius: "5px", overflow: "hidden", marginBottom: "10px" },
  progressBar: { height: "100%", backgroundColor: "#00ffcc", borderRadius: "5px", transition: "width 0.4s ease" },
  xpHint: { color: "#a1a7bb", fontSize: "11px", margin: 0 },
  card: { backgroundColor: "#171924", borderRadius: "16px", padding: "25px", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
  cardTitle: { fontSize: "16px", color: "#fff", margin: "0 0 10px 0" },
  description: { color: "#a1a7bb", fontSize: "12px", lineHeight: "1.6", margin: "0 0 25px 0" },
  gridDays: { display: "flex", gap: "10px", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "25px" },
  dayBox: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 8px", borderRadius: "10px", flex: 1, minWidth: "65px", position: "relative" },
  dayName: { fontSize: "11px", fontWeight: "bold" },
  dayReward: { fontSize: "16px", fontWeight: "bold", color: "#fff", marginTop: "6px" },
  tokenUnit: { fontSize: "10px", color: "#a1a7bb", marginTop: "2px" },
  checkMark: { position: "absolute", top: "2px", right: "5px", color: "#00ff77", fontSize: "10px", fontWeight: "bold" },
  claimBtn: { width: "100%", padding: "16px", backgroundColor: "#00ffcc", color: "#0c0d14", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 15px rgba(0, 255, 204, 0.2)" }
};
