// backend/src/modules/tasks/tasks.route.ts
// 🎯 المهام الاجتماعية: حسابات مجتمعية تابعة للمؤسسة + تحقق يدوي من اشتراك المستخدم قبل منح المكافأة
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticateJWT } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../users/users.route.js";
import { awardActivity } from "../users/levelSystem.js"; // 🎯 نقاط النشاط عند الموافقة على مهمة
const router = Router();
// ── مخططات التحقق من الصيغة ──
const verifySchema = z.object({
    channelId: z.number().int().positive(),
    socialUsername: z.string().trim().min(2).max(80),
});
const channelSchema = z.object({
    title: z.string().trim().min(1).max(100),
    platform: z.enum(["telegram", "x", "discord", "website"]).default("telegram"),
    link: z.string().trim().min(1).max(300),
    reward: z.number().nonnegative().default(10),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});
const taskIdSchema = z.object({ taskId: z.number().int().positive() });
// ==========================================
// 👤 1. قائمة الحسابات المجتمعية الفعّالة + حالة المستخدم مع كل حساب
// ==========================================
router.get("/list", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const [channels, myTasks] = await Promise.all([
            prisma.socialChannel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
            prisma.socialTask.findMany({ where: { userId }, select: { taskName: true, status: true, socialUsername: true } }),
        ]);
        const statusByTask = new Map(myTasks.map((t) => [t.taskName, t]));
        return res.json({
            channels: channels.map((c) => {
                const mine = statusByTask.get(String(c.id));
                return {
                    id: c.id,
                    title: c.title,
                    platform: c.platform,
                    link: c.link,
                    reward: Number(c.reward),
                    sortOrder: c.sortOrder,
                    userStatus: mine?.status || null,
                    socialUsername: mine?.socialUsername || null,
                };
            }),
        });
    }
    catch (error) {
        console.error("Tasks list error:", error);
        return res.status(500).json({ message: "فشل جلب قائمة المهام الاجتماعية" });
    }
});
// ==========================================
// 👤 2. إرسال اسم الحساب للمراجعة (بانتظار تأكيد الإدارة)
// ==========================================
router.post("/verify", authenticateJWT, async (req, res) => {
    try {
        const parsed = verifySchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة الطلب غير صالحة — تحقق من اسم الحساب" });
        const userId = req.user.id;
        const { channelId, socialUsername } = parsed.data;
        const channel = await prisma.socialChannel.findUnique({ where: { id: channelId } });
        if (!channel || !channel.active)
            return res.status(400).json({ message: "هذا الحساب المجتمعي غير متاح حالياً" });
        const taskName = String(channelId);
        const existing = await prisma.socialTask.findUnique({
            where: { userId_taskName: { userId, taskName } },
        });
        if (existing && existing.status === "approved") {
            return res.status(400).json({ message: "لقد أكملت هذا الاشتراك وحصلت على مكافأتك مسبقاً" });
        }
        if (existing && existing.status === "pending") {
            return res.status(400).json({ message: "اسم حسابك قيد مراجعة الإدارة حالياً — انتظر التأكيد" });
        }
        if (existing && existing.status === "rejected") {
            await prisma.socialTask.update({
                where: { id: existing.id },
                data: { socialUsername, status: "pending", isCompleted: false },
            });
        }
        else {
            await prisma.socialTask.create({
                data: {
                    userId,
                    channelId,
                    taskName,
                    socialUsername,
                    status: "pending",
                    isCompleted: false,
                    rewardClaimed: channel.reward,
                },
            });
        }
        return res.json({ message: "تم إرسال اسم حسابك للمراجعة — ستحصل على المكافأة بعد تأكيد الاشتراك", status: "pending" });
    }
    catch (error) {
        console.error("Task verify error:", error);
        return res.status(500).json({ message: "خطأ في معالجة طلب المهمة" });
    }
});
// ==========================================//
// 🛠️ 3. إدارة حسابات المجتمعات (المؤسسة) — المدير فقط
// ==========================================//
// قائمة جميع الحسابات (فعالة وغير فعالة)
router.get("/admin/channels", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const channels = await prisma.socialChannel.findMany({
            orderBy: { sortOrder: "asc" },
            include: { _count: { select: { tasks: true } } },
        });
        return res.json(channels.map((c) => ({ ...c, reward: Number(c.reward) })));
    }
    catch (error) {
        console.error("Admin channels list error:", error);
        return res.status(500).json({ message: "فشل جلب حسابات المجتمعات" });
    }
});
// إضافة حساب مجتمعي جديد
router.post("/admin/channels", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const parsed = channelSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة بيانات الحساب غير صالحة" });
        const { title, platform, link, reward, active, sortOrder } = parsed.data;
        const channel = await prisma.socialChannel.create({
            data: { title, platform, link, reward, active: active ?? true, sortOrder: sortOrder ?? 0 },
        });
        return res.status(201).json(channel);
    }
    catch (error) {
        console.error("Admin channel create error:", error);
        return res.status(500).json({ message: "فشل إضافة الحساب المجتمعي" });
    }
});
// تعديل حساب مجتمعي
router.put("/admin/channels/:id", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0)
            return res.status(400).json({ message: "معرّف الحساب غير صالح" });
        const parsed = channelSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة بيانات الحساب غير صالحة" });
        const { title, platform, link, reward, active, sortOrder } = parsed.data;
        const channel = await prisma.socialChannel.update({
            where: { id },
            data: { title, platform, link, reward, active: active ?? true, sortOrder: sortOrder ?? 0 },
        });
        return res.json(channel);
    }
    catch (error) {
        console.error("Admin channel update error:", error);
        return res.status(500).json({ message: "فشل تعديل الحساب المجتمعي" });
    }
});
// حذف حساب مجتمعي
router.delete("/admin/channels/:id", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0)
            return res.status(400).json({ message: "معرّف الحساب غير صالح" });
        await prisma.socialChannel.delete({ where: { id } });
        return res.json({ message: "تم حذف الحساب المجتمعي" });
    }
    catch (error) {
        console.error("Admin channel delete error:", error);
        return res.status(500).json({ message: "فشل حذف الحساب المجتمعي" });
    }
});
// ==========================================//
// ✅ 4. التحقق اليدوي من اشتراك المستخدم — المدير فقط
// ==========================================//
// طلبات التحقق المعلقة (بانتظار تأكيد الإدارة)
router.get("/admin/pending", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const pending = await prisma.socialTask.findMany({
            where: { status: "pending" },
            orderBy: { id: "desc" },
            include: {
                user: { select: { email: true, walletAddress: true, name: true } },
                channel: true,
            },
        });
        return res.json(pending.map((t) => ({ ...t, rewardClaimed: Number(t.rewardClaimed) })));
    }
    catch (error) {
        console.error("Admin pending error:", error);
        return res.status(500).json({ message: "فشل جلب طلبات التحقق" });
    }
});
// تأكيد الاشتراك ومنح المكافأة (إضافة للرصيد)
router.post("/admin/approve", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const parsed = taskIdSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة الطلب غير صالحة" });
        const task = await prisma.socialTask.findUnique({
            where: { id: parsed.data.taskId },
            include: { channel: true, user: true },
        });
        if (!task)
            return res.status(404).json({ message: "طلب التحقق غير موجود" });
        if (task.status === "approved")
            return res.status(400).json({ message: "تمت الموافقة على هذا الطلب مسبقاً" });
        const reward = Number(task.channel?.reward || task.rewardClaimed || 0);
        const updated = await prisma.$transaction(async (tx) => {
            await tx.socialTask.update({
                where: { id: task.id },
                data: { status: "approved", isCompleted: true, completedAt: new Date() },
            });
            return tx.user.update({
                where: { id: task.userId },
                data: { balance: { increment: reward } },
            });
        });
        // 🎯 منح نقاط النشاط لإكمال المهمة الاجتماعية
        try {
            await awardActivity(task.userId, 25);
        }
        catch (e) {
            console.error("task activity error:", e);
        }
        return res.json({
            message: `تم تأكيد اشتراك المستخدم ومنحه ${reward.toFixed(2)} SOLKIT ✓`,
            balance: Number(updated.balance),
        });
    }
    catch (error) {
        console.error("Admin approve error:", error);
        return res.status(500).json({ message: "فشل تأكيد الاشتراك ومنح المكافأة" });
    }
});
// رفض طلب التحقق (إتاحة إعادة المحاولة للمستخدم)
router.post("/admin/reject", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const parsed = taskIdSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة الطلب غير صالحة" });
        await prisma.socialTask.update({
            where: { id: parsed.data.taskId },
            data: { status: "rejected", isCompleted: false },
        });
        return res.json({ message: "تم رفض طلب التحقق — سيتمكن المستخدم من إعادة المحاولة" });
    }
    catch (error) {
        console.error("Admin reject error:", error);
        return res.status(500).json({ message: "فشل رفض طلب التحقق" });
    }
});
export default router;
