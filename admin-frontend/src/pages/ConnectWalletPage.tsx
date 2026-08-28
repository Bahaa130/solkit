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

const CONNECT_PAGE_VERSION = "2.5.0-mobile";
const CONNECT_PAGE_RPC = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || "default";

export default function ConnectWalletPage({ onWalletConnected }: ConnectWalletPageProps) {
  const { dir, t } = useLang();
  const { branding } = useBranding();
  const { connectWallet, signMessageBase64 } = useSolanaWallet();
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "connecting" | "ready" | "signing">("idle");
  const [linkedAddress, setLinkedAddress] = useState<string | null>(null);
  const [challengeMsg, setChallengeMsg] = useState<string | null>(null);
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

  // ⏸️ هل المستخدم ألغى/رفض فعلاً؟ (نفرّق بين الرفض الحقيقي والأخطاء التقنية)
  const isUserCancel = (m?: string) =>
    !m || /rejected|denied|declined|cancel|not\s*approved/i.test(m);

  // 2️⃣ الخطوة الأولى: ربط المحفظة ثم جلب رسالة التحدّي (لا توقيع هنا).
  // التوقيع يُترك لخطوة مستقلة ليتم ضمن نقرة المستخدم المباشرة —
  // متصفح Phantom الداخلي يرفض "Unexpected error" عند استدعاء التوقيع
  // من خارج سياق النقرة (بعد انتظار الشبكة).
  const handleConnectWallet = async () => {
    try {
      setPhase("connecting");
      const walletAddress = await connectWallet();
      if (!walletAddress) {
        if (isUserCancel()) toast.warning(t("connect.toastCancelled"));
        setPhase("idle");
        return;
      }

      console.log("تمت قراءة عنوان محفظة سولانا بنجاح:", walletAddress);

      // جلب رسالة التحدّي قبل التوقيع (مستقلة عن النقرة — لا مشكلة في انتظارها هنا)
      const challengeRes = await apiFetch("/api/users/login-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress })
      });
      if (!challengeRes.ok) {
        const err = await challengeRes.json().catch(() => ({}));
        toast.error(err.message || t("connect.toastAuthFailed"));
        setPhase("idle");
        return;
      }
      const { message } = await challengeRes.json();
      setLinkedAddress(walletAddress);
      setChallengeMsg(message);
      setPhase("ready");
      toast.info(t("connect.walletLinked"));
    } catch (err: any) {
      console.error("Wallet Connect Error:", err);
      const msg = err?.message;
      if (msg === "no_injected_provider") toast.warning(t("connect.noInjected"));
      else if (msg === "connect_no_address") toast.warning(t("connect.noAddress"));
      else if (typeof msg === "string" && msg && !isUserCancel(msg)) toast.warning(msg);
      else toast.warning(t("connect.toastCancelled"));
      setPhase("idle");
    }
  };

  // 3️⃣ الخطوة الثانية (ضمن نقرة المستخدم مباشرة): توقيع رسالة التحدّي فوراً
  // ثم إرسالها للسيرفر — التوقيع يحدث الآن داخل نفس النقرة فيقبله Phantom.
  const handleSignAndLogin = async () => {
    if (!linkedAddress || !challengeMsg) return;
    try {
      setPhase("signing");
      toast.info(t("connect.signing"));
      const signature = await signMessageBase64(challengeMsg);
      if (!signature) {
        toast.warning(t("connect.toastCancelled"));
        setPhase("ready");
        return;
      }

      const response = await apiFetch("/api/users/login-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: linkedAddress,
          referralCode: referralCodeFromUrl || null,
          signature,
          message: challengeMsg
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
          localStorage.setItem("solkit_wallet", linkedAddress);
          localStorage.setItem("solkit_status", userStatus);

          // تمرير البيانات المحدثة لملف التحكم الرئيسي لتحديث الواجهة فوراً
          onWalletConnected(data.token, linkedAddress, data.user?.role || "user", userStatus);
        } else {
          toast.error(t("connect.toastNoToken"));
          setPhase("ready");
        }
      } else {
        try {
          const errData = JSON.parse(rawText);
          toast.error(errData.message || t("connect.toastAuthFailed"));
        } catch {
          toast.error(t("connect.toastConnFailed"));
        }
        setPhase("ready");
      }
    } catch (err: any) {
      console.error("Wallet Login Error:", err);
      const msg = err?.message;
      if (typeof msg === "string" && msg && !isUserCancel(msg)) toast.warning(msg);
      else toast.warning(t("connect.toastCancelled"));
      setPhase("ready");
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

        {phase === "idle" && (
          <button
            onClick={handleConnectWallet}
            className="btn btn-purple btn-block"
            style={{ padding: "16px", fontSize: 15, marginTop: 8 }}
          >
            {t("connect.connectBtn")}
          </button>
        )}

        {phase === "connecting" && (
          <button disabled className="btn btn-purple btn-block" style={{ padding: "16px", fontSize: 15, marginTop: 8 }}>
            <span className="spinner" style={{ borderTopColor: "#fff" }} />
            {t("connect.loadingBtn")}
          </button>
        )}

        {phase === "ready" && (
          <>
            <div className="pill" style={{ ...styles.badge, marginBottom: 14 }}>
              ✅ {t("connect.walletLinked")}
            </div>
            <button
              onClick={handleSignAndLogin}
              className="btn btn-primary btn-block"
              style={{ padding: "16px", fontSize: 15, marginTop: 8 }}
            >
              {t("connect.signBtn")}
            </button>
            <p style={{ ...styles.hint, marginTop: 12 }}>{t("connect.signHint")}</p>
          </>
        )}

        {phase === "signing" && (
          <button disabled className="btn btn-primary btn-block" style={{ padding: "16px", fontSize: 15, marginTop: 8 }}>
            <span className="spinner" style={{ borderTopColor: "#fff" }} />
            {t("connect.loadingBtn")}
          </button>
        )}

        <div style={styles.features}>
          <span className="pill" style={featurePill}>{t("connect.featureMining")}</span>
          <span className="pill" style={featurePill}>{t("connect.featureReferral")}</span>
        </div>

        <div style={styles.version}>{CONNECT_PAGE_VERSION}<br />{CONNECT_PAGE_RPC}</div>
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
  features: { display: "flex", justifyContent: "center", gap: 8, marginTop: 26, flexWrap: "wrap" },
  hint: { color: C.muted, fontSize: 11.5, lineHeight: 1.8 },
  version: {
    marginTop: 18,
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    textAlign: "center",
    direction: "ltr",
    wordBreak: "break-all",
    lineHeight: 1.6
  }
};
