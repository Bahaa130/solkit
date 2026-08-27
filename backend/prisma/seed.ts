// backend/prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ADMIN_WALLET = "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";

async function main() {
  console.log("⏳ جاري بدء ضخ البيانات التجريبية المرتبطة بـ Admin Wallet...");

  // جلب حساب المدير الفعلي الذي قمت بالتسجيل به منذ قليل
  const adminUser = await prisma.user.findUnique({
    where: { walletAddress: ADMIN_WALLET }
  });

  if (!adminUser) {
    console.log("❌ لم يتم العثور على حساب المسؤول، يرجى تسجيل الدخول بالمحفظة أولاً في المتصفح!");
    return;
  }

  // 1. تحديث رصيد حسابك ومستواك لتجربة التغيير البصري في العداد والبونص
  const updatedAdmin = await prisma.user.update({
    where: { id: adminUser.id },
    data: {
      name: "Solkit المسؤول",
      balance: 150.75000000, // رصيد أولي للاختبار
      currentLevel: 2,       // المستوى الثاني لتجربة زيادة الـ Rate بـ 5%
      currentXp: 45,         // نقاط الخبرة الحالية
    } as any
  });

  // 2. إنشاء جلسة تعدين نشطة حية لحسابك (ليعمل العداد التنازلي فوراً بدلاً من وضعه كمتوقف)
  await (prisma as any).miningSession.deleteMany({ where: { userId: adminUser.id } });
  await (prisma as any).miningSession.create({
    data: {
      userId: adminUser.id,
      miningRate: 0.525000, // سرعة المستوى الثاني
      startedAt: new Date(),
      endsAt: new Date(Date.now() + 20 * 60 * 60 * 1000), // متبقي 20 ساعة تنازلية لتراها حية
      status: "active",
      minedAmount: 0.00000000
    }
  });

  console.log("✅ تم ربط وضخ البيانات التجريبية لحساب المسؤول بنجاح فوري!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
