import React, { useState, useEffect } from "react";

interface TasksPageProps { userId: number; token: string; }

export default function TasksPage({ userId, token }: TasksPageProps) {
  const [username, setUsername] = useState("");
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);

  const checkCompletedTasks = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        const completed = (data.socialTasks || []).map((t: any) => t.taskName);
        setCompletedTasks(completed);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => { checkCompletedTasks(); }, [userId]);

  const handleVerify = async (name: string) => {
    if (!token || !username) return alert("الرجاء كتابة اسم حسابك أولاً!");
    try {
      const res = await fetch("/api/users/verify-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ taskName: name, socialUsername: username })
      });
      if (res.ok) {
        alert("✓ تم التحقق ومنحك +10 SOLKIT لحسابك!");
        checkCompletedTasks();
      } else {
        alert("هذه المهمة مسجلة مسبقاً أو غير صالحة");
      }
    } catch { alert("خطأ في معالجة طلب المهمة"); }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto", color: "#fff", direction: "rtl" }}>
      <h2 style={{ textAlign: "center", fontSize: "20px" }}>🎁 هدايا الاشتراك والمهمات الاجتماعية</h2>
      <input type="text" placeholder="اسم حسابك للتوثيق (مثال: @user)" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%", padding: "12px", backgroundColor: "#171924", border: "1px solid #2d314d", borderRadius: "8px", color: "#fff", marginTop: "20px", outline: "none", boxSizing: "border-box" }} />
      
      <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "15px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#171924", padding: "15px", borderRadius: "12px" }}>
          <div><h4>الانضمام لمجموعة Telegram الرسمية</h4><span style={{ color: "#00ffcc", fontSize: "12px" }}>+10.00 SOLKIT</span></div>
          {completedTasks.includes("telegram_join") ? <button disabled style={{ padding: "8px 16px", backgroundColor: "#222531", color: "#a1a7bb", border: "none", borderRadius: "6px" }}>✓ مكتمل ومقفل</button> : <button onClick={() => handleVerify("telegram_join")} style={{ padding: "8px 16px", backgroundColor: "#00ffcc", color: "#000", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>تحقق الآن 🚀</button>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#171924", padding: "15px", borderRadius: "12px" }}>
          <div><h4>متابعة حسابنا الرسمي على منصة X</h4><span style={{ color: "#00ffcc", fontSize: "12px" }}>+10.00 SOLKIT</span></div>
          {completedTasks.includes("x_follow") ? <button disabled style={{ padding: "8px 16px", backgroundColor: "#222531", color: "#a1a7bb", border: "none", borderRadius: "6px" }}>✓ مكتمل ومقفل</button> : <button onClick={() => handleVerify("x_follow")} style={{ padding: "8px 16px", backgroundColor: "#00ffcc", color: "#000", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>تحقق الآن 🚀</button>}
        </div>
      </div>
    </div>
  );
}
