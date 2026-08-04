import React, { useState, useEffect } from "react";

interface BonusPageProps { userId: number; token: string; }

export default function BonusPage({ userId, token }: BonusPageProps) {
  const [streak, setStreak] = useState(1);
  const [xp, setXp] = useState(0);

  const fetchBonusStatus = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setXp(Number(data.currentXp || 0));
        const bonuses = data.dailyBonuses || [];
        if (bonuses.length > 0) {
          const latest = bonuses.sort((a: any, b: any) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
          setStreak(latest.streakDay || 1);
        }
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchBonusStatus(); }, [userId]);

  const handleClaim = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/users/claim-daily", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchBonusStatus();
      } else {
        alert(data.message || "عذراً، قمت بالمطالبة بالبونص اليوم بالفعل!");
      }
    } catch { alert("خطأ في الاتصال بالخادم"); }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto", color: "#fff", direction: "rtl", textAlign: "center" }}>
      <div style={{ backgroundColor: "#171924", padding: "20px", borderRadius: "16px", marginBottom: "20px" }}>
        <h3>شريط خبرة حسابك الحالية (XP Progress)</h3>
        <div style={{ width: "100%", height: "12px", backgroundColor: "#222531", borderRadius: "6px", overflow: "hidden", marginTop: "12px" }}>
          <div style={{ width: `${xp}%`, height: "100%", backgroundColor: "#00ffcc", borderRadius: "6px", transition: "width 0.4s ease" }}></div>
        </div>
        <span style={{ fontSize: "12px", color: "#a1a7bb", display: "block", marginTop: "8px" }}>مستوى الـ XP الحالي لديك: {xp} / 100 نقطه</span>
      </div>

      <div style={{ backgroundColor: "#171924", padding: "25px", borderRadius: "16px" }}>
        <h4>سلسلة مكافآت الحضور المتتالية الحالية: <span style={{ color: "#ffaa00" }}>يوم {streak}</span></h4>
        <button onClick={handleClaim} style={{ marginTop: "24px", padding: "16px 32px", backgroundColor: "#ffaa00", color: "#000", border: "none", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: "pointer", boxShadow: "0 4px 15px rgba(255,170,0,0.2)" }}>
          🎁 المطالبة ببونص الحضور اليومي وتصعيد الـ XP
        </button>
      </div>
    </div>
  );
}
