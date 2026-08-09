import React, { useState, useEffect } from "react";

interface ConnectWalletPageProps {
  onWalletConnected: (jwtToken: string, walletAddress: string, role: string, activationStatus: string) => void;
}

export default function ConnectWalletPage({ onWalletConnected }: ConnectWalletPageProps) {
  const [loading, setLoading] = useState(false);
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState<string | null>(null);

  // 1. التقاط كود الإحالة تلقائياً من الرابط عند فتح الصفحة
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref) {
      setReferralCodeFromUrl(ref);
      console.log("تم رصد كود إحالة نشط من الرابط:", ref);
    }
  }, []);

  // 2. دالة الاتصال بمحفظة Phantom والتسجيل الأمني الآمن
  const handleConnectPhantom = async () => {
    const provider = (window as any).solana;

    if (!provider || !provider.isPhantom) {
      alert("الرجاء التأكد من تثبيت محفظة Phantom وتسجيل الدخول إليها أولاً!");
      window.open("https://phantom.app", "_blank");
      return;
    }

    try {
      setLoading(true);
      const resp = await provider.connect({ onlyIfTrusted: false });
      const walletAddress = resp.publicKey.toString();
      
      console.log("تمت قراءة عنوان محفظة سولانا بنجاح:", walletAddress);

      // إرسال طلب تسجيل الدخول الآمن المتوافق مع حماية Zod في الخلفية
      const response = await fetch("/api/users/login-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: walletAddress,
          referralCode: referralCodeFromUrl || null
        })
      });

      // 🛡️ الحل الحديدي: قراءة نص الاستجابة مرة واحدة فقط وتخزينه لمنع الـ Body stream error
      const rawText = await response.text();

      if (response.ok && rawText) {
        const data = JSON.parse(rawText);
        if (data.token) {
          alert("تم التوثيق الرقمي الآمن وتسجيل الدخول بنجاح! 🔐🎉");
          
          const userStatus = data.user?.activationStatus || "inactive";

          // حفظ الجلسة الموحدة بشكل ثابت لمنع ظهور صفحة الدفع مجدداً
          localStorage.setItem("solkit_token", data.token);
          localStorage.setItem("solkit_role", data.user?.role || "user");
          localStorage.setItem("solkit_user_id", data.user?.id?.toString() || "0");
          localStorage.setItem("solkit_wallet", walletAddress);
          localStorage.setItem("solkit_status", userStatus); // 🟢 تثبيت الحالة الحقيقية (active) كاش للمتصفح

          // تمرير البيانات المحدثة لملف التحكم الرئيسي لتحديث الواجهة فوراً
          onWalletConnected(data.token, walletAddress, data.user?.role || "user", userStatus);
        } else {
          alert("خطأ: لم يتم إصدار التوكن الأمني من السيرفر.");
        }
      } else {
        // في حال وجود خطأ بالخلفية، يتم فك تشفير رسالة السيرفر بأمان
        try {
          const errData = JSON.parse(rawText);
          alert(errData.message || "فشل التحقق الأمني الرقمي من المحفظة.");
        } catch {
          alert("فشل الاتصال الأمني بالخادم الفولاذي.");
        }
      }
    } catch (err: any) {
      console.error("Wallet Connection Error:", err);
      alert(err?.message || "تم إلغاء عملية ربط المحفظة وتصريح الدخول.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>مرحباً بك في SOLKIT 💎</h1>
        <p style={styles.subtitle}>تطبيق التعدين الأول والأكثر أماناً القائم على شبكة سولانا</p>
        
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

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "#0c0d14", color: "#ffffff", fontFamily: "sans-serif", padding: "20px", direction: "rtl" },
  card: { backgroundColor: "#171924", borderRadius: "20px", padding: "40px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", maxWidth: "450px", width: "100%" },
  title: { fontSize: "26px", color: "#ffffff", marginBottom: "10px", fontWeight: "bold" },
  subtitle: { color: "#a1a7bb", fontSize: "13px", marginBottom: "35px", lineHeight: "1.6" },
  badge: { backgroundColor: "rgba(0, 255, 119, 0.12)", color: "#00ff77", padding: "12px", borderRadius: "10px", fontSize: "13px", marginBottom: "25px", fontWeight: "bold", border: "1px solid rgba(0, 255, 119, 0.2)" },
  connectButton: { width: "100%", padding: "16px", backgroundColor: "#512da8", color: "#ffffff", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 15px rgba(81, 45, 168, 0.4)" }
};
