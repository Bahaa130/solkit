// سكربت حقن بيانات وهمية لاختبار نظام المستويات ولوحة القادة
// ⚠️ لا يمسّ محفظة المدير نهائياً — يقتصر على مستخدمين ببادئة FakeTest_ فقط
import { PrismaClient } from "@prisma/client";

const ADMIN_WALLET = process.env.ADMIN_WALLET || "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";
const PREFIX = "FakeTest_";
const COUNT = 60;

const XP_THRESHOLDS = [0, 120, 300, 600, 1100, 1900, 3200, 5200, 8000];

function levelFromXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) lvl = i + 1;
  }
  return lvl;
}

function randWallet(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 44; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return PREFIX + s;
}

const prisma = new PrismaClient();

async function main() {
  // تنظيف سابق (مستخدمين وهميين فقط) لضمان إعادة التشغيل بأمان
  const deleted = await prisma.user.deleteMany({ where: { walletAddress: { startsWith: PREFIX } } });
  console.log(`🧹 حُذف ${deleted.count} مستخدم وهمي سابق`);

  // تأكيد أن محفظة المدير غير مدرجة (حماية إضافية)
  const admin = await prisma.user.findFirst({ where: { walletAddress: ADMIN_WALLET } });
  if (admin) console.log(`🔒 محفظة المدير موجودة (id=${admin.id}) ولم تُمسّ`);

  const users = [];
  for (let i = 0; i < COUNT; i++) {
    // توزيع متدرّج يغطي كل المستويات من 1 إلى 9 + تشويش عشوائي
    const base = Math.floor(((i + 1) / COUNT) * 9000);
    const xp = Math.max(0, base + Math.floor((Math.random() - 0.5) * 400));
    users.push({
      walletAddress: randWallet(),
      email: `${PREFIX}${i}_${Math.random().toString(36).slice(2, 8)}@solkit.test`,
      referralCode: `FAKE${i}_${Math.random().toString(36).slice(2, 8)}`,
      activationStatus: "active" as const,
      balance: Math.random() * 5,
      currentXp: xp,
      currentLevel: levelFromXp(xp),
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)),
    });
  }

  const created = await prisma.user.createMany({ data: users });
  console.log(`✅ أُنشئ ${created.count} مستخدم وهمي`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
