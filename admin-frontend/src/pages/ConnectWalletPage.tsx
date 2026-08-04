import React, { useState, useEffect } from "react";

interface ConnectWalletPageProps {
  onWalletConnected: (jwtToken: string, walletAddress: string, role: string) => void;
}

export default function ConnectWalletPage({ onWalletConnected }: ConnectWalletPageProps) {
  const [loading, setLoading] = useState(false);
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState<string | null>(null);

  // 1. التقاط كود الإحالة تلقائياً من رابط الموقع (?ref=xxxx) عند فتح الصفحة
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref) {
      setReferralCodeFromUrl(ref);
      console.log("تم رصد كود إحالة نشط من الرابط:", ref);
    }
  }, []);

  // 2. دالة الاتصال بمحفظة Phantom والتسجيل الأمني عبر الـ JWT
  const handleConnectPhantom = async () => {
    const provider = (window as any).solana;

    if (!provider || !provider.isPhantom) {
      alert("الرجاء تثبيت محفظة Phantom أولاً على متصفحك أو استخدام متصفح يدعم محافظ الويب 3!");
      window.open("https://phantom.app", "_blank");
      return;
    }

    try {
      setLoading(true);
      
      // طلب الاقتران والموافقة الرسمية من المحفظة
      const resp = await provider.connect({ onlyIfTrusted: false });
      const walletAddress = resp.publicKey.toString();
      
      console.log("تمت قراءة عنوان محفظة سولانا بنجاح:", walletAddress);

      // إرسال طلب تسجيل الدخول الآمن المتوافق مع حماية Zod في الخلفية
      const response = await fetch("/api/users/login-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: walletAddress,
          referralCode: referralCodeFromUrl
        })
      });

      const data = await response.json();

      if (response.ok && data.token) {
        alert("تم التوثيق الرقمي الآمن وتسجيل الدخول بنجاح! 🔐🎉");
        
        // حفظ التوكن والرتبة في الـ localStorage لضمان المزامنة عند تحديث الصفحة
        localStorage.setItem("solkit_token", data.token);
        localStorage.setItem("solkit_role", data.user.role);
        localStorage.setItem("solkit_user_id", data.user.id.toString());
        localStorage.setItem("solkit_wallet", walletAddress);

        // تمرير البيانات المحدثة لملف التحكم الرئيسي لتحديث الواجهة فوراً
        onWalletConnected(data.token, walletAddress, data.user.role);
      } else {
        alert(data.message || "فشل التحقق الأمني الرقمي من بصمة محفظتك.");
      }
    } catch (err: any) {
      console.error("Wallet Connection Error:", err);
      alert(err?.message || "تم إلغاء عملية ربط المحفظة وتصريح الدخول من قبلك.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>مرحباً بك في SOLKIT 💎</h1>
        <p style={styles.subtitle}>تطبيق التعدين الأول والأكثر أماناً القائم على شبكة سولانا السريعة</p>
        
        {/* إشعار ترحيبي أخضر يظهر للمستخدم فقط إذا جاء عبر رابط دعوة صديق */}
        {referralCodeFromUrl && (
          <div style={styles.badge}>
            🎁 أنت تسجل عبر رابط دعوة صديق (كود المكافأة: {referralCodeFromUrl})
          </div>
        )}

        <button 
          onClick={handleConnectPhantom} 
          disabled={loading} 
          style={styles.connectButton}
        >
          {loading ? "جاري التوثيق الآمن..." : "ربط محفظة Phantom 🦊"}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 🎨 واجهة التنسيق البصري الاحترافي المظلم
// ==========================================
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "#0c0d14",
    color: "#ffffff",
    fontFamily: "sans-serif",
    padding: "20px",
    direction: "rtl"
  },
  card: {
    backgroundColor: "#171924",
    borderRadius: "20px",
    padding: "40px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    maxWidth: "450px",
    width: "100%"
  },
  title: {
    fontSize: "26px",
    color: "#ffffff",
    marginBottom: "10px",
    fontWeight: "bold"
  },
  subtitle: {
    color: "#a1a7bb",
    fontSize: "13px",
    marginBottom: "35px",
    lineHeight: "1.6"
  },
  badge: {
    backgroundColor: "rgba(0, 255, 119, 0.12)",
    color: "#00ff77",
    padding: "12px",
    borderRadius: "10px",
    fontSize: "13px",
    marginBottom: "25px",
    fontWeight: "bold",
    border: "1px solid rgba(0, 255, 119, 0.2)"
  },
  connectButton: {
    width: "100%",
    padding: "16px",
    backgroundColor: "#512da8", // اللون البنفسجي الرسمي المعترف به لمحفظة Phantom
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 15px rgba(81, 45, 168, 0.4)"
  }
};
