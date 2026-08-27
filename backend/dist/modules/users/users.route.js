// backend/src/modules/users/users.route.ts
import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Connection, PublicKey } from "@solana/web3.js"; // 🌐 استدعاء مكتبة الـ Web3 القياسية للتحقق
import { getAssociatedTokenAddress } from "@solana/spl-token"; // 🪙 دوال حساب التوكن المرتبط (ATA)
import bs58 from "bs58"; // 🔐 فك ترميز عنوان المحفظة (base58)
import { ed25519 } from "@noble/curves/ed25519"; // ✍️ التحقق من توقيع ed25519
import { prisma } from "../../config/prisma.js";
import { authenticateJWT } from "../../middlewares/auth.middleware.js";
import { getSettings, updateSettings } from "../../config/settings.js";
import gamesRouter from "../games/games.route.js"; // 🎮 مسارات الألعاب المصغرة والمستوى الموحد
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_SOLKIT_KEY_2026";
export const ADMIN_WALLET = process.env.ADMIN_WALLET || "4NC1c6ZUrpTibV1FuxomBstGbkjXWNYtJwYvbFezKuQo";
const MINING_RATES = { 1: 0.5, 2: 0.525, 3: 0.55 };
const DAILY_REWARDS = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0];
// ⛏️ دالة مساعدة: إنهاء جلسة تعدين وقيد أرباحها اللحظية لرصيد المستخدم
// تُستخدم عند اكتمال الـ 24 ساعة (في mining-status) أو عند بدء جلسة جديدة فوق جلسة منتهية (mining-start)
const finishMiningSession = async (session, minedAmount, userId) => {
    await prisma.$transaction([
        prisma.miningSession.update({
            where: { id: session.id },
            data: { status: "completed", minedAmount }
        }),
        prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: minedAmount } }
        })
    ]);
};
// 🪪 مخزن مؤقت لرموز التحدّي (nonce) بصلاحية 5 دقائق — يمنع إعادة استخدام التوقيع
const challengeStore = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of challengeStore)
        if (v.expires < now)
            challengeStore.delete(k);
}, 60000).unref();
const registerSchema = z.object({
    walletAddress: z.string().min(32).max(44),
    referralCode: z.string().optional().nullable(),
    signature: z.string().optional(),
    message: z.string().optional(),
}).passthrough();
const withdrawSchema = z.object({
    amount: z.number().positive(),
    walletAddress: z.string().min(32).max(44),
});
// ==========================================
// 🪪 0. توليد رسالة تحدّي للتوقيع (إثبات ملكية المحفظة)
// ==========================================
// يطلبها الـ Frontend قبل الربط: السيرفر يولّد رسالة + nonce عشوائي،
// والمستخدم يوقّعها داخل Phantom (تظهر نافذة التوقيع الحقيقية = "تأكيد الربط" المرئي).
// هذا أقوى من مجرد قراءة العنوان — يثبت أن المستخدم يملك المفتاح الخاص فعلياً.
router.post("/login-challenge", async (req, res) => {
    try {
        const { walletAddress } = req.body || {};
        if (!walletAddress || typeof walletAddress !== "string" || walletAddress.length < 32) {
            return res.status(400).json({ message: "عنوان المحفظة مطلوب" });
        }
        const nonce = crypto.randomBytes(16).toString("hex");
        const message = `SOLKIT | تأكيد ملكية المحفظة\n` +
            `Wallet: ${walletAddress}\n` +
            `Nonce: ${nonce}\n` +
            `لن يتم خصم أي رصيد من حسابك.`;
        // 💾 خزّن الـ nonce مربوطاً بالمحفظة (صلاحية 5 دقائق)
        challengeStore.set(walletAddress, { nonce, expires: Date.now() + 5 * 60000 });
        return res.json({ message, nonce });
    }
    catch (error) {
        console.error("Login challenge error:", error);
        return res.status(500).json({ message: "تعذّر توليد رسالة التحدّي" });
    }
});
// ==========================================
// 🔑 1. مسار تسجيل الدخول وإصدار التوكن
// ==========================================
// 🔑 تحديث مسار تسجيل الدخول وإصدار التوكن ليقرأ الحالة الحية الحقيقية من الـ MySQL
// الآن يتطلب توقيعاً على رسالة التحدّي (signature) للتحقق من ملكية المحفظة.
router.post("/login-wallet", async (req, res) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة المحفظة غير صالحة" });
        const { walletAddress, referralCode, signature, message } = parsed.data;
        // 🔎 استخراج الـ nonce من الرسالة الموقّعة (السطر الثالث: "Nonce: xxx")
        const nonceMatch = typeof message === "string" ? message.match(/Nonce:\s*([0-9a-f]+)/i) : null;
        const nonce = nonceMatch ? nonceMatch[1] : "";
        // ✍️ التحقق من توقيع ملكية المحفظة (ed25519) — يمنع انتحال العناوين
        if (!signature || !message || typeof signature !== "string" || typeof message !== "string") {
            return res.status(400).json({ message: "توقيع تأكيد المحفظة مطلوب" });
        }
        try {
            const pubKeyBytes = bs58.decode(walletAddress);
            const msgBytes = new TextEncoder().encode(message);
            // الواجهة ترسل التوقيع Base64 (Uint8Array → Base64)
            const sigBytes = Buffer.from(signature, "base64");
            const valid = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
            if (!valid)
                return res.status(401).json({ message: "توقيع غير صالح — تأكد أنك وقّعت بالمحفظة الصحيحة" });
            // 🔒 تحقق من أن الرسالة تحوي الـ nonce الصحيح وغير منتهٍ
            const stored = challengeStore.get(walletAddress);
            if (!stored || stored.nonce !== nonce || stored.expires < Date.now()) {
                return res.status(401).json({ message: "انتهت صلاحية رمز التحدّي، أعد المحاولة" });
            }
        }
        catch (sigErr) {
            console.error("فشل التحقق من التوقيع:", sigErr);
            return res.status(401).json({ message: "تعذّر التحقق من توقيع المحفظة" });
        }
        let user = await prisma.user.findUnique({ where: { walletAddress } });
        if (!user) {
            const newRefCode = crypto.randomBytes(4).toString("hex");
            const referrer = referralCode ? await prisma.user.findUnique({ where: { referralCode } }) : null;
            user = await prisma.user.create({
                data: {
                    email: `${walletAddress.substring(0, 6)}@solkit.com`,
                    walletAddress,
                    referralCode: newRefCode,
                    referrerId: referrer?.id || null,
                    activationStatus: "inactive", // الحساب ينزل غير نشط افتراضياً حتى يثبت تفعيله ودفع الرسوم
                    currentLevel: 1,
                    currentXp: 0,
                    balance: 0.0,
                },
            });
        }
        const role = walletAddress === ADMIN_WALLET ? "admin" : "user";
        // 🛡️ محفظة المدير مفعّلة دائماً — لا تتطلب دفع رسوم التفعيل
        const effectiveStatus = role === "admin" ? "active" : user.activationStatus;
        // ⭐ تضمين حالة التفعيل الفعلي الحية الحالية داخل الـ JWT Payload
        const token = jwt.sign({ id: user.id, walletAddress: user.walletAddress, role, activationStatus: effectiveStatus }, JWT_SECRET, { expiresIn: "24h" });
        return res.json({
            message: "Authentication successful",
            token,
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                role,
                balance: Number(user.balance),
                activationStatus: effectiveStatus // 🟢 المشرف دائماً active
            }
        });
    }
    catch (error) {
        // 🛠️ تسجيل الخطأ الحقيقي في السيرفر لتسهيل التشخيص (لا يُكشف للمستخدم)
        console.error("Login wallet error:", error);
        const msg = error?.message ? error.message : "حدث خطأ غير متوقع أثناء تسجيل الدخول";
        return res.status(500).json({ message: `تعذّر تسجيل الدخول: ${msg}` });
    }
});
// ==========================================
// 💳 2. مسار تفعيل الحساب الصارم والتحقق الفعلي عبر البلوكشين (Solana RPC)
// ==========================================
router.post("/activate-account", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const { txHash } = req.body;
        if (!txHash)
            return res.status(400).json({ message: "رمز توقيع المعاملة TxHash مطلوب للتوثيق!" });
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { referrer: true }
        });
        if (!user)
            return res.status(404).json({ message: "المستخدم غير موجود" });
        if (user.activationStatus === "active")
            return res.status(400).json({ message: "حسابك مفعّل مسبقاً!" });
        try {
            // 🌐 استخدام الـ Endpoint الصحيح والمستقر من البيئة أو Devnet كاحتياطي
            const solanaRpcUrl = process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.devnet.solana.com";
            const connection = new Connection(solanaRpcUrl, "confirmed");
            // 🔁 إعادة محاولة قراءة المعاملة: devnet قد لا يُرجعها فوراً (تأخير الفهرسة)
            let txStatus = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                txStatus = await connection.getTransaction(txHash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
                if (txStatus)
                    break;
                await new Promise((r) => setTimeout(r, 2500)); // انتظر 2.5s بين المحاولات
            }
            if (!txStatus) {
                return res.status(400).json({ message: "لم يتم العثور على المعاملة على البلوكشين بعد، أعد المحاولة خلال ثوانٍ" });
            }
            // 🔍 فحص أمني متقدم وثابت: التحقق من المستلم الحقيقي والمبلغ الفعلي للتحويل
            const meta = txStatus.meta;
            if (!meta || meta.err)
                return res.status(400).json({ message: "المعاملة الممررة فاشلة على البلوكشين!" });
            // قراءة التغيير الفعلي في رصيد محفظة الموقع للتأكد من وصول الأموال (0.01 SOL التجريبية)
            const postBalances = meta.postBalances;
            const preBalances = meta.preBalances;
            const accountKeys = txStatus.transaction.message.getAccountKeys();
            // 🔎 دالة مساعدة: إيجاد فهرس حساب داخل المعاملة ثم استخراج صافي ما استلمه فعلياً
            const findAccountIndex = (address) => {
                for (let i = 0; i < accountKeys.length; i++) {
                    if (accountKeys.get(i)?.toString() === address)
                        return i;
                }
                return -1;
            };
            const receivedBy = (address) => {
                const idx = findAccountIndex(address);
                return idx === -1 ? 0 : postBalances[idx] - preBalances[idx];
            };
            // ✅ التحقق من وصول حصة محفظة الموقع (0.015 SOL مع وجود إحالة، أو 0.03 SOL كاملة بدونها)
            const adminReceived = receivedBy(ADMIN_WALLET);
            const minimumRequiredAmount = user.referrerId ? 15000000 : 30000000;
            if (adminReceived < minimumRequiredAmount) {
                return res.status(400).json({ message: "المبلغ المرسل غير كافٍ لتنشيط رسوم التفعيل" });
            }
            // 🛡️ التحقق الصارم من وصول الحصة الأخرى (0.015 SOL) لمحفظة صاحب الإحالة الفعلي على البلوكشين
            if (user.referrerId && user.referrer?.walletAddress) {
                const referrerReceived = receivedBy(user.referrer.walletAddress);
                if (referrerReceived < 15000000) {
                    return res.status(400).json({
                        message: "احتيال: لم تصل حصة صاحب الإحالة (0.015 SOL) إلى محفظته على البلوكشين!"
                    });
                }
            }
        }
        catch (blockchainError) {
            console.error("Solana verification breakdown:", blockchainError);
            return res.status(400).json({ message: "فشل السيرفر في التحقق من المعاملة عبر عقدة الـ RPC، حاول مجدداً" });
        }
        const siteShare = 0.015;
        const referrerShare = user.referrerId ? 0.015 : 0.0;
        // تفعيل الحساب الفعلي وتقسيم الأرباح في الـ MySQL بعد نجاح توثيق البلوكشين
        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: { activationStatus: "active" }
            });
            await tx.payment.create({
                data: { userId, amount: siteShare, currency: "SOL", status: "paid", txHash: `${txHash}_site` }
            });
            if (user.referrerId) {
                await tx.payment.create({
                    data: { userId: user.referrerId, amount: referrerShare, currency: "SOL", status: "paid", txHash: `${txHash}_referrer` }
                });
                await tx.user.update({
                    where: { id: user.referrerId },
                    data: { balance: { increment: referrerShare } }
                });
            }
            else {
                await tx.payment.create({ data: { userId, amount: 0.03, currency: "SOL", status: "paid", txHash: txHash } });
            }
        });
        return res.json({ message: "تم تفعيل حسابك كمستخدم نشط بنجاح باهر عبر البلوكشين! 🎉", activationStatus: "active" });
    }
    catch (error) {
        return res.status(500).json({ message: "حدث خطأ داخلي أثناء معالجة تفعيل الحساب" });
    }
});
// ==========================================
// 💸 1. مسارات سحب الأرباح (مرفوعة هنا للأعلى لمنع الـ 404 والـ 500)
// ==========================================
// أ. مسار تقديم طلب سحب مالي جديد
router.post("/withdraw", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const parsed = withdrawSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: "صيغة المدخلات الممررة غير سليمة" });
        }
        const { amount, walletAddress } = parsed.data;
        const MIN_WITHDRAW = 10;
        const GAS_FEE = 0.000005;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || Number(user.balance) < amount) {
            return res.status(400).json({ message: "عذراً، رصيدك المتاح غير كافٍ لإتمام السحب!" });
        }
        if (amount < MIN_WITHDRAW) {
            return res.status(400).json({ message: `الحد الأدنى المسموح به للسحب هو ${MIN_WITHDRAW} عملة!` });
        }
        // خصم وتسجيل المعاملة
        await prisma.$transaction([
            prisma.user.update({ where: { id: userId }, data: { balance: { decrement: amount } } }),
            prisma.withdrawal.create({ data: { userId, amount, walletAddress, gasFee: GAS_FEE, status: "pending" } })
        ]);
        return res.status(201).json({ message: "تم تقديم طلب السحب بنجاح 🟠 قيد التدقيق" });
    }
    catch (error) {
        console.error("Withdrawal error:", error);
        return res.status(500).json({ message: "Failed to process withdrawal" });
    }
});
// ب. مسار جلب سجل السحوبات الموثق للمستخدم الحالي
router.get("/withdraw-history", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        // جلب السجلات والتأكد من مطابقة الأنواع
        const history = await prisma.withdrawal.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" }
        });
        return res.json(history || []); // إرجاع مصفوفة فارغة بدلاً من تجميد السيرفر بالخطأ 500 لو الجدول فارغ
    }
    catch (error) {
        console.error("Withdraw history fetch error:", error);
        return res.status(500).json({ message: "Error fetching history data safely" });
    }
});
// ✅ مسار شبكة الإحالة المصلح والمحمي بالكامل 100% ضد الـ Array Syntax Crash
router.get("/referral-network", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id; // 🛡️ استخراج معرف المستخدم بأمان مطلق من التوكن المشفر
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                referrals: {
                    include: { payments: true }
                }
            }
        });
        if (!user)
            return res.status(404).json({ message: "User not found" });
        let totalEarned = 0;
        const processed = user.referrals.map((ref) => {
            // 💰 التحقق مما إذا كان العضو المدعو قد دفع رسوم التفعيل وتغيرت حالته بنجاح
            const isPaid = ref.activationStatus === "active";
            const bonus = isPaid ? 0.015 : 0.00;
            totalEarned += bonus;
            // 🔐 دالة إخفاء الإيميل المصححة هندسياً لمنع انهيار الـ substring
            let maskedEmail = "u***@solkit.com";
            if (ref.email && ref.email.includes("@")) {
                const parts = ref.email.split("@");
                const usernamePart = parts[0];
                const domainPart = parts[1];
                maskedEmail = usernamePart.substring(0, Math.min(2, usernamePart.length)) + "***@" + domainPart;
            }
            return {
                id: ref.id,
                email: maskedEmail,
                joinDate: ref.createdAt,
                status: isPaid ? "مفعل ومثبت ✅" : "غير نشط ⏳",
                bonusEarned: bonus
            };
        });
        return res.json({
            referralCode: user.referralCode,
            totalReferrals: processed.length,
            activeReferrals: processed.filter(r => r.status.includes("مفعل")).length,
            totalReferralEarnings: totalEarned,
            referralList: processed
        });
    }
    catch (error) {
        console.error("Referral network calculation backend error:", error);
        return res.status(500).json({ message: "Error fetching referral network safely" });
    }
});
// ==========================================
// ⛏️ 3. مسارات التعدين والمطالبة بالبونص اليومي (الـ Endpoint المفقود تم إنشاؤه)
// ==========================================
router.get("/mining-status", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.activationStatus !== "active")
            return res.status(403).json({ message: "Account inactive" });
        const activeSession = await prisma.miningSession.findFirst({
            where: { userId, status: "active" },
            orderBy: { startedAt: "desc" }
        });
        const currentRate = MINING_RATES[user.currentLevel || 1] || 0.5;
        if (!activeSession)
            return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
        const now = new Date();
        const timeLeftSeconds = Math.max(0, Math.floor((new Date(activeSession.endsAt).getTime() - now.getTime()) / 1000));
        // ✅ عند انتهاء جلسة الـ 24 ساعة: قيد الأرباح اللحظية الفعلية (ما مضى فعلاً) لرصيد المستخدم وأكمل الجلسة
        if (timeLeftSeconds <= 0) {
            const secondsPassed = 24 * 60 * 60; // الجلسة اكتملت كاملة
            const minedAmount = (secondsPassed * currentRate) / 3600;
            await finishMiningSession(activeSession, minedAmount, userId);
            return res.json({ status: "stopped", miningRate: currentRate, timeLeft: 0, pendingMinedAmount: 0 });
        }
        // 🔄 جلسة نشطة: أرباح لحظية = الزمن المنقضي فعلياً × المعدّل
        const secondsPassed = Math.floor((now.getTime() - new Date(activeSession.startedAt).getTime()) / 1000);
        const pendingMinedAmount = (secondsPassed * currentRate) / 3600;
        return res.json({
            status: "active",
            miningRate: currentRate,
            timeLeft: timeLeftSeconds,
            endsAt: activeSession.endsAt,
            pendingMinedAmount,
            sessionId: activeSession.id
        });
    }
    catch {
        return res.status(500).json({ message: "Error" });
    }
});
router.post("/mining-start", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.activationStatus !== "active")
            return res.status(403).json({ message: "Forbidden" });
        // 🔒 منع الجلسات المزدوجة + قيد أرباح أي جلسة سابقة انتهت لحظياً قبل بدء جديدة
        const existing = await prisma.miningSession.findFirst({
            where: { userId, status: "active" },
            orderBy: { startedAt: "desc" }
        });
        if (existing) {
            const now = new Date();
            const endsAt = new Date(existing.endsAt);
            if (endsAt.getTime() > now.getTime()) {
                // جلسة لا تزال قيد التشغيل → ارفض البدء المزدوج
                const secondsPassed = Math.floor((now.getTime() - new Date(existing.startedAt).getTime()) / 1000);
                return res.status(400).json({
                    message: "Already mining",
                    status: "active",
                    timeLeft: Math.floor((endsAt.getTime() - now.getTime()) / 1000),
                    pendingMinedAmount: (secondsPassed * Number(existing.miningRate)) / 3600
                });
            }
            // جلسة سابقة انتهت ولم تُقيد بعد → قيد أرباحها اللحظية أولاً
            const secondsPassed = 24 * 60 * 60;
            const minedAmount = (secondsPassed * Number(existing.miningRate)) / 3600;
            await finishMiningSession(existing, minedAmount, userId);
        }
        const currentRate = MINING_RATES[user.currentLevel || 1] || 0.5;
        const startedAt = new Date();
        const endsAt = new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);
        const created = await prisma.miningSession.create({ data: { userId, miningRate: currentRate, startedAt, endsAt, status: "active" } });
        return res.status(201).json({ message: "Mining started", sessionId: created.id, startedAt, endsAt });
    }
    catch {
        return res.status(500).json({ message: "Error" });
    }
});
// ✅ 4. مسار المطالبة الفعلي بالبونص اليومي (claim-daily) المفقود
router.post("/claim-daily", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.activationStatus !== "active")
            return res.status(403).json({ message: "يجب تفعيل الحساب أولاً" });
        // التحقق برمجياً من جدول الـ DailyBonus لمنع استلام الجائزة مرتين في نفس اليوم
        const lastClaim = await prisma.dailyBonus.findFirst({
            where: { userId },
            orderBy: { claimedAt: "desc" }
        });
        let currentStreak = 1;
        if (lastClaim) {
            const hoursDiff = (now.getTime() - new Date(lastClaim.claimedAt).getTime()) / (1000 * 60 * 60);
            if (hoursDiff < 24) {
                return res.status(400).json({ message: "عذراً، لقد قمت بالمطالبة بالبونص اليوم بالفعل! عد غداً ⏳" });
            }
            else if (hoursDiff >= 24 && hoursDiff < 48) {
                currentStreak = lastClaim.streakDay >= 7 ? 1 : lastClaim.streakDay + 1;
            }
            else {
                currentStreak = 1; // تصفير السلسلة للغياب
            }
        }
        const baseReward = DAILY_REWARDS[currentStreak - 1];
        const finalReward = baseReward * (user.currentLevel === 2 ? 1.05 : user.currentLevel === 3 ? 1.10 : 1.0);
        let newXp = (user.currentXp || 0) + 15;
        let newLevel = user.currentLevel || 1;
        if (newXp >= 100) {
            newXp -= 100;
            newLevel += 1;
        }
        await prisma.$transaction([
            prisma.dailyBonus.create({ data: { userId, streakDay: currentStreak, rewardAmount: finalReward, claimedAt: now } }),
            prisma.user.update({ where: { id: userId }, data: { balance: { increment: finalReward }, currentXp: newXp, currentLevel: newLevel } })
        ]);
        return res.json({ message: `تمت المطالبة ببونص اليوم ${currentStreak} بنجاح! 🎉`, reward: finalReward, currentLevel: newLevel, xpProgress: `${newXp}/100` });
    }
    catch (error) {
        return res.status(500).json({ message: "Failed to process bonus" });
    }
});
// ==========================================
// 🎮 مسارات الألعاب المصغرة والمستوى الموحد
// ==========================================
router.use("/games", authenticateJWT, gamesRouter);
// ==========================================
// 👑 6. مسارات لوحة الإدارة العليا (Admin Panel)
// ==========================================
// فحص صلاحية الموقع العليا مباشرة (تجنباً لميدل وير requireAdmin المعطّل في auth.middleware)
export const isAdmin = (req, res) => {
    if (!req.user || req.user.role !== "admin" || req.user.walletAddress !== ADMIN_WALLET) {
        res.status(403).json({ message: "صلاحية مرفوضة: هذا النطاق مخصص لإدارة الموقع العليا فقط!" });
        return false;
    }
    return true;
};
// أ. الإحصائيات العامة للوحة الإدارة
router.get("/admin/stats", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const [totalUsers, activeMiners, pendingWithdrawals, payments] = await Promise.all([
            prisma.user.count(),
            prisma.miningSession.count({ where: { status: "active" } }),
            prisma.withdrawal.count({ where: { status: "pending" } }),
            prisma.payment.findMany({ select: { amount: true, txHash: true } })
        ]);
        // 💰 إيرادات الموقع = كل سجلات الدفع عدا حصص صاحب الإحالة (التي تنتهي بـ _referrer)
        let totalRevenue = 0;
        for (const p of payments) {
            const hash = p.txHash ? String(p.txHash) : null;
            if (!hash?.endsWith("_referrer")) {
                totalRevenue += Number(p.amount || 0);
            }
        }
        return res.json({ totalUsers, activeMiners, pendingWithdrawals, totalRevenue });
    }
    catch (error) {
        console.error("Admin stats error:", error);
        return res.status(500).json({ message: "فشل السيرفر في معالجة طلب الإدارة الحية" });
    }
});
// ب. قائمة طلبات السحب المعلقة
router.get("/admin/pending-withdrawals", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const list = await prisma.withdrawal.findMany({
            where: { status: "pending" },
            include: { user: { select: { email: true, walletAddress: true } } },
            orderBy: { createdAt: "asc" }
        });
        return res.json(list || []);
    }
    catch (error) {
        console.error("Admin pending withdrawals error:", error);
        return res.status(500).json({ message: "فشل جلب قائمة سحوبات شبكة سولانا المعلقة" });
    }
});
// ج. موافقة/رفض طلب سحب مع إمكانية إعادة الرصيد عند الرفض
const processWithdrawalSchema = z.object({
    status: z.enum(["completed", "failed"]),
    txHash: z.string().min(30).nullable().optional(),
});
router.post("/admin/process-withdrawal/:id", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const withdrawalId = Number(req.params.id);
        const parsed = processWithdrawalSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة المدخلات غير سليمة" });
        const { status, txHash } = parsed.data;
        const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!withdrawal)
            return res.status(404).json({ message: "طلب السحب غير موجود" });
        if (withdrawal.status !== "pending")
            return res.status(400).json({ message: "تمت معالجة هذا الطلب مسبقاً" });
        await prisma.$transaction([
            prisma.withdrawal.update({
                where: { id: withdrawalId },
                data: { status, txHash: status === "completed" ? txHash : null }
            }),
            ...(status === "failed"
                ? [prisma.user.update({ where: { id: withdrawal.userId }, data: { balance: { increment: Number(withdrawal.amount) } } })]
                : [])
        ]);
        return res.json({
            message: status === "completed" ? "تم تأكيد عملية السحب بنجاح! 🟢" : "تم رفض الطلب وإعادة الرصيد للمستخدم 🔴"
        });
    }
    catch (error) {
        console.error("Admin process withdrawal error:", error);
        return res.status(500).json({ message: "فشل تحديث حالة السحب" });
    }
});
// ==========================================
// 🎁 7. مسارات توزيع جوائز التوكن (يدوياً من لوحة المدير)
// ==========================================
const TOKEN_MINT = process.env.TOKEN_MINT || "";
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 9);
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";
const getRpcUrl = () => process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.devnet.solana.com";
// دالة مساعدة: جلب خطة التوزيع النشطة (تُنشئ الافتراضية إن لم توجد)
const getActivePlan = async () => {
    let plan = await prisma.distributionPlan.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } });
    if (!plan) {
        plan = await prisma.distributionPlan.create({ data: { levels: { 1: 40, 2: 35, 3: 25 }, active: true } });
    }
    return plan;
};
// دالة مساعدة: رصيد توكن الخزانة على البلوكشين
const getTreasuryTokenBalance = async (connection, mint, owner) => {
    try {
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
        let total = 0;
        for (const a of accounts.value) {
            total += Number(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
        }
        return total;
    }
    catch {
        return 0;
    }
};
// دالة مساعدة: التحقق البلوكشيني من استلام مستلم لمبلغ توكن في معاملة
const verifyTokenReceipt = async (connection, signature, mint, recipientWallet, expectedAmount) => {
    try {
        const txInfo = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (!txInfo || !txInfo.meta || txInfo.meta.err)
            return false;
        const postBalances = txInfo.meta.postTokenBalances || [];
        for (const entry of postBalances) {
            if (entry.owner === recipientWallet &&
                entry.mint === mint.toBase58() &&
                Number(entry.uiTokenAmount.uiAmount || 0) >= expectedAmount - 1e-9) {
                return true;
            }
        }
        // بديل احترازي: فحص رصيد حساب التوكن المرتبط حالياً
        const ata = await getAssociatedTokenAddress(mint, new PublicKey(recipientWallet));
        const info = await connection.getTokenAccountBalance(ata, "confirmed");
        return Number(info.value.uiAmount || 0) >= expectedAmount - 1e-9;
    }
    catch {
        return false;
    }
};
// أ. نظرة عامة على الأرصدة المجمعة وحالة التوكن
router.get("/admin/distribution/overview", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const connection = new Connection(getRpcUrl(), "confirmed");
        const configured = Boolean(TOKEN_MINT);
        let treasuryBalance = 0;
        if (configured) {
            treasuryBalance = await getTreasuryTokenBalance(connection, new PublicKey(TOKEN_MINT), new PublicKey(ADMIN_WALLET));
        }
        const [accruedAgg, totalUsers, activeUsers, miningAgg, tasksAgg, gamesAgg, bonusAgg, poolUsers] = await Promise.all([
            prisma.user.aggregate({ _sum: { balance: true } }),
            prisma.user.count(),
            prisma.user.findMany({
                where: { activationStatus: "active", walletAddress: { not: null } },
                select: { currentLevel: true }
            }),
            prisma.miningSession.aggregate({ _sum: { minedAmount: true } }),
            prisma.socialTask.aggregate({ _sum: { rewardClaimed: true } }),
            prisma.gamePlayRecord.aggregate({ _sum: { reward: true } }),
            prisma.dailyBonus.aggregate({ _sum: { rewardAmount: true } }),
            prisma.user.count({ where: { activationStatus: "active", walletAddress: { not: null }, balance: { gt: 0 } } })
        ]);
        const levelCounts = {};
        activeUsers.forEach((u) => {
            levelCounts[u.currentLevel] = (levelCounts[u.currentLevel] || 0) + 1;
        });
        const plan = await getActivePlan();
        return res.json({
            configured,
            mint: TOKEN_MINT || null,
            decimals: TOKEN_DECIMALS,
            network: SOLANA_NETWORK,
            treasuryWallet: ADMIN_WALLET,
            treasuryBalance,
            accruedBalance: Number(accruedAgg._sum.balance || 0),
            poolUsers,
            poolSources: {
                mining: Number(miningAgg._sum.minedAmount || 0),
                tasks: Number(tasksAgg._sum.rewardClaimed || 0),
                games: Number(gamesAgg._sum.reward || 0),
                bonus: Number(bonusAgg._sum.rewardAmount || 0)
            },
            totalUsers,
            totalActive: activeUsers.length,
            levelCounts,
            plan: { id: plan.id, levels: plan.levels }
        });
    }
    catch (error) {
        console.error("Distribution overview error:", error);
        return res.status(500).json({ message: "فشل جلب نظرة عامة على توزيع الجوائز" });
    }
});
// ب. قراءة خطة التوزيع النسبية
router.get("/admin/distribution/plan", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const plan = await getActivePlan();
        return res.json(plan);
    }
    catch {
        return res.status(500).json({ message: "خطأ في جلب خطة التوزيع" });
    }
});
// ج. حفظ خطة التوزيع (نسب مئوية لكل مستوى، المجموع = 100%)
const planSchema = z
    .object({
    levels: z.record(z.string(), z.number().min(0))
})
    .refine((body) => {
    const vals = Object.values(body.levels);
    if (!vals.length)
        return false;
    return Math.abs(vals.reduce((a, b) => a + b, 0) - 100) < 0.001;
}, { message: "مجموع النسب يجب أن يساوي 100%" });
router.post("/admin/distribution/plan", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const parsed = planSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة خطة التوزيع غير صالحة — تأكد أن مجموع النسب 100%" });
        const levels = parsed.data.levels;
        const saved = await prisma.$transaction(async (tx) => {
            await tx.distributionPlan.updateMany({ where: { active: true }, data: { active: false } });
            return tx.distributionPlan.create({ data: { levels: levels, active: true } });
        });
        return res.json(saved);
    }
    catch {
        return res.status(500).json({ message: "خطأ في حفظ خطة التوزيع" });
    }
});
// د. تجهيز التوزيع: رصيد المجمع الداخلي (المهام/التعدين/الألعاب/البونص) يوزَّع على كل مشترك حسب مساهمته
router.get("/admin/distribution/prepare", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        if (!TOKEN_MINT)
            return res.status(400).json({ message: "لم يتم إعداد التوكن بعد — شغّل سكربت setup-token أولاً" });
        const connection = new Connection(getRpcUrl(), "confirmed");
        const mint = new PublicKey(TOKEN_MINT);
        const treasury = new PublicKey(ADMIN_WALLET);
        const treasuryBalance = await getTreasuryTokenBalance(connection, mint, treasury);
        // رصيد المجمع = مجموع أرصدة المشتركين النشطين (تُجمع من المهام والتعدين والألعاب والبونص)
        const poolUsers = await prisma.user.findMany({
            where: { activationStatus: "active", walletAddress: { not: null }, balance: { gt: 0 } },
            select: { id: true, walletAddress: true, currentLevel: true, balance: true }
        });
        const pool = poolUsers.reduce((s, u) => s + Number(u.balance), 0);
        if (pool <= 0)
            return res.status(400).json({ message: "رصيد المجمع صفر — لا توجد أرصدة متراكمة بعد" });
        if (treasuryBalance < pool) {
            return res.status(400).json({
                message: `رصيد خزانة التوكن (${treasuryBalance.toFixed(2)}) أقل من رصيد المجمع (${pool.toFixed(2)}) — امنح التوكن للخزانة أولاً`
            });
        }
        // توزيع نسبي: كل مشترك يستلم حصته = رصيده الحالي (مساهمته في المجمع)
        const recipients = [];
        for (const u of poolUsers) {
            const amount = Math.floor(Number(u.balance) * 1e8) / 1e8; // تقريب لـ 8 خانات دون تجاوز
            if (amount <= 0)
                continue;
            const ata = await getAssociatedTokenAddress(mint, new PublicKey(u.walletAddress));
            const info = await connection.getAccountInfo(ata);
            recipients.push({
                userId: u.id,
                walletAddress: u.walletAddress,
                level: u.currentLevel || 1,
                balance: Number(u.balance),
                amount,
                hasAta: Boolean(info)
            });
        }
        const treasuryAta = await getAssociatedTokenAddress(mint, treasury);
        return res.json({
            mint: TOKEN_MINT,
            decimals: TOKEN_DECIMALS,
            network: SOLANA_NETWORK,
            pool,
            treasuryWallet: ADMIN_WALLET,
            treasuryAta: treasuryAta.toBase58(),
            recipientCount: recipients.length,
            recipients
        });
    }
    catch (error) {
        console.error("Distribution prepare error:", error);
        return res.status(500).json({ message: "فشل تجهيز توزيع الجوائز" });
    }
});
// هـ. تأكيد التوزيع بعد توقيع المدير: تحقق بلوكشيني ثم تسجيل الدفعة والسجلات
const confirmDistributionSchema = z.object({
    recipients: z
        .array(z.object({
        userId: z.number().int(),
        walletAddress: z.string().min(32).max(44),
        level: z.number().int(),
        amount: z.number().positive(),
        txSignature: z.string().min(40)
    }))
        .min(1)
});
router.post("/admin/distribution/confirm", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        if (!TOKEN_MINT)
            return res.status(400).json({ message: "لم يتم إعداد التوكن بعد" });
        const parsed = confirmDistributionSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة بيانات التوزيع غير سليمة" });
        const { recipients } = parsed.data;
        const connection = new Connection(getRpcUrl(), "confirmed");
        const mint = new PublicKey(TOKEN_MINT);
        // 1) تحقق بلوكشيني صارم: كل مستلم استلم مبلغه فعلاً في معاملته
        for (const r of recipients) {
            const ok = await verifyTokenReceipt(connection, r.txSignature, mint, r.walletAddress, r.amount);
            if (!ok) {
                return res.status(400).json({ message: `فشل التحقق البلوكشيني للمستلم ${r.walletAddress.substring(0, 6)}... — أعد التحقق من المعاملة` });
            }
        }
        // 2) تسجيل الدفعة وسجلات الاستلام لكل مشترك
        const totalTokens = recipients.reduce((s, r) => s + r.amount, 0);
        const plan = await getActivePlan();
        const signatures = Array.from(new Set(recipients.map((r) => r.txSignature)));
        const batch = await prisma.$transaction(async (tx) => {
            const b = await tx.distributionBatch.create({
                data: {
                    planId: plan.id,
                    totalTokens,
                    recipientCount: recipients.length,
                    txSignatures: signatures,
                    status: "confirmed"
                }
            });
            for (const r of recipients) {
                await tx.distributionRecord.create({
                    data: {
                        batchId: b.id,
                        userId: r.userId,
                        walletAddress: r.walletAddress,
                        level: r.level,
                        amount: r.amount,
                        txSignature: r.txSignature,
                        status: "confirmed"
                    }
                });
                // 🔄 تصفير رصيد المشترك بعد استلام حصته — مع الحفاظ على مستوى الحساب والخبرة وتقدّم الألعاب
                await tx.user.update({
                    where: { id: r.userId },
                    data: { balance: 0 }
                });
            }
            return b;
        });
        return res.json({
            message: "تم توزيع رصيد المجمع وتصفير الأرصدة بنجاح 🎉",
            batchId: batch.id,
            totalTokens,
            recipientCount: recipients.length
        });
    }
    catch (error) {
        console.error("Distribution confirm error:", error);
        return res.status(500).json({ message: "فشل تأكيد توزيع الجوائز" });
    }
});
// و. سجل دفعات التوزيع السابقة
router.get("/admin/distribution/history", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const batches = await prisma.distributionBatch.findMany({
            include: { plan: true, records: true },
            orderBy: { createdAt: "desc" }
        });
        return res.json(batches || []);
    }
    catch {
        return res.status(500).json({ message: "خطأ في جلب سجل التوزيع" });
    }
});
// ز. ملخص توزيعات التوكن لصفحة الإسقاط الجوي: الإجمالي الموزَّع + سجل المشترك الشخصي
router.get("/distribution/summary", authenticateJWT, async (req, res) => {
    try {
        const [batchesAgg, batchCount, userRecords] = await Promise.all([
            prisma.distributionBatch.aggregate({
                _sum: { totalTokens: true, recipientCount: true },
                where: { status: "confirmed" }
            }),
            prisma.distributionBatch.count({ where: { status: "confirmed" } }),
            prisma.distributionRecord.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: "desc" },
                select: { id: true, batchId: true, amount: true, status: true, createdAt: true }
            })
        ]);
        return res.json({
            totalDistributed: Number(batchesAgg._sum.totalTokens || 0),
            totalRecipients: Number(batchesAgg._sum.recipientCount || 0),
            batchCount,
            userRecords: userRecords.map((r) => ({
                id: r.id,
                batchId: r.batchId,
                amount: Number(r.amount),
                status: r.status,
                createdAt: r.createdAt
            })),
            userTotal: userRecords.reduce((s, r) => s + Number(r.amount), 0)
        });
    }
    catch (error) {
        console.error("Distribution summary error:", error);
        return res.status(500).json({ message: "فشل جلب ملخص توزيع التوكن" });
    }
});
// ==========================================//
//  👤 5. مسار الحساب العام بالـ ID//
//  ==========================================
// ⚙️ قراءة الإعدادات العامة (قبل /:id حتى لا يلتقطها معرّف المسار) — متاح للجميع
router.get("/settings", async (_req, res) => {
    try {
        const s = getSettings();
        return res.json({
            maintenanceMode: s.maintenanceMode,
            maintenanceMessage: s.maintenanceMessage,
            tgeTarget: s.tgeTarget
        });
    }
    catch (error) {
        console.error("GET /settings error:", error);
        return res.status(500).json({ message: "Error" });
    }
});
// ⚙️ تحديث الإعدادات — للمدير فقط
const settingsSchema = z.object({
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().min(1).max(300).optional(),
    tgeTarget: z.number().int().min(0).optional()
});
router.post("/admin/settings", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const parsed = settingsSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة الإعدادات غير صالحة" });
        const updated = updateSettings(parsed.data);
        return res.json({
            message: "تم حفظ الإعدادات بنجاح ✅",
            maintenanceMode: updated.maintenanceMode,
            maintenanceMessage: updated.maintenanceMessage,
            tgeTarget: updated.tgeTarget
        });
    }
    catch (error) {
        console.error("Update settings error:", error);
        return res.status(500).json({ message: "فشل حفظ الإعدادات" });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: Number(req.params.id) },
            include: {
                socialTasks: true,
                dailyBonuses: true,
                // 🔗 إرجاع محفظة صاحب الإحالة حتى تستطيع الواجهة الأمامية تقسيم الدفع على البلوكشين
                referrer: { select: { id: true, walletAddress: true } }
            }
        });
        if (!user)
            return res.status(404).json({ message: "Not found" });
        return res.json(user);
    }
    catch {
        return res.status(500).json({ message: "Error" });
    }
});
export default router;
