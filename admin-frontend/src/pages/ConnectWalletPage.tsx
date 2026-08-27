import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { C, font } from "../theme";
import { useLang } from "../i18n/index.tsx";
import { useBranding } from "../branding";
import CoinIcon from "../components/CoinIcon";
import { useToast } from "../components/Toast";
import { useSolanaWallet } from "../lib/walletProvider";

interface ConnectWalletPageProps {
  onWalletConnected: (jwtToken: string, walletAddress: string, role: string, activationStatus: string) => void;
}

export default function ConnectWalletPage({ onWalletConnected }: ConnectWalletPageProps) {
  const { dir, t } = useLang();
  const { branding } = useBranding();
  const { connectWallet, signMessageBase64 } = useSolanaWallet();
  const [loading, setLoading] = useState(false);
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState<string | null>(null);
  const toast = useToast();

  // 1. التقاط كود الإحالة تلقائياً من الرابط عند فتح الصفحة
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref) {
      setReferralCodeFromUrl(ref);
      console.log("تم رصد كود إحالة نشط من الرابط:", ref);
    }
  }, []);

  // 2. دالة الاتصال بالمحفظة (Phantom على الويب / WalletConnect على الموبايل) والتسجيل الآمن
  const handleConnectPhantom = async () => {
    try {
      setLoading(true);
      // 🔌 الاتصال بالمحفظة عبر المحوّل الموحّد (يبقى داخل التطبيق على الموبايل)
      const walletAddress = await connectWallet();
      if (!walletAddress) {
        // على الموبايل بدون WalletConnect: فُتح التطبيق داخل متصفح Phantom ويتابع المستخدم هناك
        return;
      }

      console.log("تمت قراءة عنوان محفظة سولانا بنجاح:", walletAddress);

      // 1️⃣ جلب رسالة التحدّي من السيرفر
      const challengeRes = await apiFetch("/api/users/login-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress })
      });
      if (!challengeRes.ok) {
        const err = await challengeRes.json().catch(() => ({}));
        toast.error(err.message || t("connect.toastAuthFailed"));
        return;
      }
      const { message } = await challengeRes.json();

      // 2️⃣ توقيع الرسالة داخل المحفظة (تظهر نافذة التوقيع = تأكيد الربط المرئي)
      toast.info(t("connect.signing"));
      const signature = await signMessageBase64(message);
      if (!signature) {
        toast.warning(t("connect.toastCancelled"));
        return;
      }

      // 3️⃣ إرسال التوقيع للسيرفر للتحقق من ملكية المحفظة
      const response = await apiFetch("/api/users/login-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: walletAddress,
          referralCode: referralCodeFromUrl || null,
          signature,
          message
        })
      });

      // 🛡️ الحل الحديدي: قراءة نص الاستجابة مرة واحدة فقط وتخزينه لمنع الـ Body stream error
      const rawText = await response.text();

      if (response.ok && rawText) {
        const data = JSON.parse(rawText);
        if (data.token) {
          toast.success(t("connect.toastSuccess"));

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
          toast.error(t("connect.toastNoToken"));
        }
      } else {
        // في حال وجود خطأ بالخلفية، يتم فك تشفير رسالة السيرفر بأمان
        try {
          const errData = JSON.parse(rawText);
          toast.error(errData.message || t("connect.toastAuthFailed"));
        } catch {
          toast.error(t("connect.toastConnFailed"));
        }
      }
    } catch (err: any) {
      console.error("Wallet Connection Error:", err);
      toast.warning(err?.message || t("connect.toastCancelled"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...styles.container, direction: dir }}>
      <div className="glass" style={styles.card}>
        <div className="floaty" style={{ fontSize: 52, marginBottom: 6 }}><CoinIcon size={52} /></div>
        <h1 style={styles.title}>{t("connect.title")} <span className="gradient-text">{branding.projectName}</span></h1>
        <p style={styles.subtitle}>{t("connect.subtitle")}</p>

        {referralCodeFromUrl && (
          <div className="pill" style={styles.badge}>
            {t("connect.refBadge", { code: referralCodeFromUrl })}
          </div>
        )}

        <button
          onClick={handleConnectPhantom}
          disabled={loading}
          className="btn btn-purple btn-block"
          style={{ padding: "16px", fontSize: 15, marginTop: 8 }}
        >
          {loading ? (
            <>
              <span className="spinner" style={{ borderTopColor: "#fff" }} />
              {t("connect.loadingBtn")}
            </>
          ) : (
            t("connect.connectBtn")
          )}
        </button>

        <div style={styles.features}>
          <span className="pill" style={featurePill}>{t("connect.featureMining")}</span>
          <span className="pill" style={featurePill}>{t("connect.featureReferral")}</span>
        </div>
      </div>
    </div>
  );
}

const featurePill: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  color: C.muted,
  border: "1px solid rgba(255,255,255,0.1)"
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    fontFamily: font,
    padding: 20,
    direction: "rtl"
  },
  card: {
    maxWidth: 460,
    width: "100%",
    padding: "40px 34px",
    textAlign: "center",
    animation: "fadeInUp .5s cubic-bezier(.16,1,.3,1) both"
  },
  title: { fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 10 },
  subtitle: { color: C.muted, fontSize: 13, marginBottom: 30, lineHeight: 1.7 },
  badge: {
    background: "rgba(0,255,119,0.12)",
    color: "#00ff77",
    padding: "10px 14px",
    fontSize: 12,
    marginBottom: 22,
    border: "1px solid rgba(0,255,119,0.25)",
    animation: "pulseGlow 2s ease-out infinite"
  },
  features: { display: "flex", justifyContent: "center", gap: 8, marginTop: 26, flexWrap: "wrap" }
};
