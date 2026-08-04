import React, { useState, useEffect } from "react";

// تعريف بنية بيانات المهمة القادمة من الخلفية
interface TaskState {
  taskName: "telegram_join" | "x_follow";
  isCompleted: boolean;
  rewardClaimed: number;
}

export default function TasksPage({ userId }: { userId: number }) {
  const BACKEND_URL = `/api/users/${userId}`;

  // حالات التحقق للمدخلات لكل مهمة
  const [telegramUser, setTelegramUser] = useState("");
  const [xUser, setXUser] = useState("");
  
  // حالات حفظ المهام المكتملة
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [loadingTask, setLoadingTask] = useState<string | null>(null);

  // 1. جلب قائمة المهمات المنجزة سابقاً لقفلها فور فتح الصفحة
  const fetchUserTasksStatus = async () => {
    try {
      // نستعلم عن السجل المالي للمستخدم للتأكد من مهامه عبر الـ API
      const res = await fetch(`${BACKEND_URL}/withdraw-history`); // أو أي Endpoint تجلب بيانات المستخدم العامة
      const userRes = await fetch(BACKEND_URL);
      if (userRes.ok) {
        const userData = await userRes.json();
        // جلب المهام المخزنة من علاقة الـ socialTasks المدمجة بالـ schema
        const tasks = userData.socialTasks || [];
        const completedNames = tasks
          .filter((t: any) => t.isCompleted)
          .map((t: any) => t.taskName);
        setCompletedTasks(completedNames);
      }
    } catch (error) {
      console.error("Failed to load tasks status:", error);
    }
  };

  useEffect(() => {
    fetchUserTasksStatus();
  }, [userId]);

  // 2. دالة معالجة وإرسال طلب التحقق من المهمة
  const handleVerifyTask = async (taskName: "telegram_join" | "x_follow", username: string, url: string) => {
    if (!username) {
      return alert("الرجاء إدخال اسم حسابك أولاً للتحقق من الاشتراك!");
    }

    // فتح رابط القناة أو الحساب للمستخدم في علامة تبويب جديدة ليشترك
    window.open(url, "_blank");

    try {
      setLoadingTask(taskName);
      
      // إرسال طلب التوثيق للخلفية لمنح المكافأة وقفل المهمة في الـ MySQL
      const res = await fetch(`${BACKEND_URL}/verify-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName,
          socialUsername: username,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(`🎉 مبروك! تم التحقق بنجاح وإضافة مكافأة المهمة إلى رصيدك.`);
        fetchUserTasksStatus(); // إعادة جلب البيانات لقفل الأزرار فوراً
      } else {
        alert(data.message || "فشل التحقق من المهمة، يرجى المحاولة لاحقاً.");
      }
    } catch (error) {
      alert("خطأ في الاتصال بالخادم.");
    } finally {
      setLoadingTask(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>🎁 مهام هدايا الاشتراك</h1>
        <p style={styles.subtitle}>قم بمتابعة حساباتنا الرسمية للحصول على مكافآت فورية وتغذية رصيد تعدينك!</p>
      </div>

      {/* 1. بطاقة مهمة التليجرام */}
      <div style={styles.taskCard}>
        <div style={styles.taskInfo}>
          <span style={styles.taskIcon}>📢</span>
          <div>
            <h3 style={styles.taskTitle}>الانضمام لقناة التليجرام الرسمية</h3>
            <span style={styles.taskReward}>+10.00 SOLKIT</span>
          </div>
        </div>

        {completedTasks.includes("telegram_join") ? (
          <button disabled style={styles.completedBtn}>✓ مكتمل وتم استلام الهدية</button>
        ) : (
          <div style={styles.actionRow}>
            <input
              type="text"
              placeholder="اسم حسابك (مثال: @username)"
              value={telegramUser}
              onChange={(e) => setTelegramUser(e.target.value)}
              style={styles.input}
            />
            <button
              onClick={() => handleVerifyTask("telegram_join", telegramUser, "https://t.me")}
              disabled={loadingTask === "telegram_join"}
              style={styles.verifyBtn}
            >
              {loadingTask === "telegram_join" ? "جاري التحقق..." : "اشترك وتحقق 🚀"}
            </button>
          </div>
        )}
      </div>

      {/* 2. بطاقة مهمة حساب X (تويتر) */}
      <div style={styles.taskCard}>
        <div style={styles.taskInfo}>
          <span style={styles.taskIcon}>𝕏</span>
          <div>
            <h3 style={styles.taskTitle}>متابعة حسابنا على منصة X</h3>
            <span style={styles.taskReward}>+10.00 SOLKIT</span>
          </div>
        </div>

        {completedTasks.includes("x_follow") ? (
          <button disabled style={styles.completedBtn}>✓ مكتمل وتم استلام الهدية</button>
        ) : (
          <div style={styles.actionRow}>
            <input
              type="text"
              placeholder="اسم حسابك على X"
              value={xUser}
              onChange={(e) => setXUser(e.target.value)}
              style={styles.input}
            />
            <button
              onClick={() => handleVerifyTask("x_follow", xUser, "https://x.com")}
              disabled={loadingTask === "x_follow"}
              style={styles.verifyBtn}
            >
              {loadingTask === "x_follow" ? "جاري التحقق..." : "متابعة وتحقق 🚀"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 🎨 التنسيقات البصرية المتناسقة للوضع المظلم
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    maxWidth: "600px",
    margin: "0 auto",
    direction: "rtl"
  },
  headerBox: {
    textAlign: "center",
    marginBottom: "10px"
  },
  title: {
    fontSize: "24px",
    color: "#ffffff"
  },
  subtitle: {
    color: "#a1a7bb",
    fontSize: "13px",
    lineHeight: "1.6",
    marginTop: "5px"
  },
  taskCard: {
    backgroundColor: "#171924",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  taskInfo: {
    display: "flex",
    alignItems: "center",
    gap: "15px"
  },
  taskIcon: {
    fontSize: "32px",
    backgroundColor: "#1f2235",
    padding: "10px",
    borderRadius: "12px",
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  taskTitle: {
    fontSize: "15px",
    color: "#ffffff",
    margin: 0
  },
  taskReward: {
    color: "#00ffcc",
    fontSize: "13px",
    fontWeight: "bold",
    display: "block",
    marginTop: "4px"
  },
  actionRow: {
    display: "flex",
    gap: "10px",
    width: "100%"
  },
  input: {
    backgroundColor: "#1f2235",
    border: "1px solid #2d314d",
    borderRadius: "8px",
    padding: "12px",
    color: "#ffffff",
    fontSize: "13px",
    flex: 1,
    outline: "none"
  },
  verifyBtn: {
    backgroundColor: "#00ffcc",
    color: "#0c0d14",
    border: "none",
    borderRadius: "8px",
    padding: "0 15px",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "13px",
    transition: "all 0.2s"
  },
  completedBtn: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#222531",
    color: "#a1a7bb",
    border: "1px solid #2d314d",
    borderRadius: "8px",
    fontWeight: "bold",
    fontSize: "13px",
    cursor: "not-allowed"
  }
};
