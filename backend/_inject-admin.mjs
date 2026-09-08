// 💉 حقن/تفعيل حساب المدير — يعمل على أي قاعدة بيانات يحددها DATABASE_URL في وقت التشغيل
// الاستخدام (PowerShell):
//   $env:DATABASE_URL="mysql://..."; node _inject-admin.mjs
//
// البنية: يفعّل الحساب، وإن وجده فارغًا يحقن بيانات نموذجية. الآمن: لا يمسح بيانات قائمة.
import { PrismaClient } from "@prisma/client";

const ADMIN_WALLET = process.env.ADMIN_WALLET || "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";
const SEED = { balance: "64.14000000", currentLevel: 3, currentXp: 305 };

const prisma = new PrismaClient();

// تأكد تماماً من المحفظة قبل أي كتابة
if (ADMIN_WALLET.includes("...") || ADMIN_WALLET.length < 32) {
  console.error("⚠️ ضع عنوان المحفظة الكامل لـ ADMIN_WALLET في النص قبل التشغيل!");
  process.exit(2);
}

try {
  let user = await prisma.user.findUnique({ where: { walletAddress: ADMIN_WALLET } });

  if (!user) {
    const referralCode = ("ADM" + ADMIN_WALLET.slice(0, 6)).toUpperCase();
    user = await prisma.user.create({
      data: {
        walletAddress: ADMIN_WALLET,
        email: `${ADMIN_WALLET}@solkit.admin`,
        referralCode,
        activationStatus: "active",
        balance: SEED.balance,
        currentLevel: SEED.currentLevel,
        currentXp: SEED.currentXp,
      },
    });
    console.log("🆕 أنشئ حساب المدير:", user.id, user.referralCode);
  } else {
    const empty = Number(user.balance) === 0 && user.currentLevel === 1 && user.currentXp === 0;
    const prevStatus = user.activationStatus;
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        activationStatus: "active",
        ...(empty
          ? { balance: SEED.balance, currentLevel: SEED.currentLevel, currentXp: SEED.currentXp }
          : {}),
      },
    });
    console.log(`♻️ حُدّث الحساب #${user.id}: الحالة ${prevStatus} → ${user.activationStatus}` + (empty ? " + حُقنت بيانات نموذجية" : " (بيانات موجودة مُبقاة)"));
  }

  console.log("── النتيجة ──");
  console.log(JSON.stringify({
    id: user.id,
    walletAddress: user.walletAddress,
    activationStatus: user.activationStatus,
    balance: String(user.balance),
    currentLevel: user.currentLevel,
    currentXp: user.currentXp,
  }, null, 2));
} catch (e) {
  console.error("❌ فشل التنفيذ:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}