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
import { getLevelPlan, rateForLevel, awardActivity } from "./levelSystem.js"; // 🎯 نظام المستويات حسب النشاط
import gamesRouter from "../games/games.route.js"; // 🎮 مسارات الألعاب المصغرة والمستوى الموحد
const router = Router();
// 🔐 إغلاق آمن: رفض البدائل العامة (كانت معروفة في مستودع مفتوح = ثغرة تزوير توكنات).
// الخادم يتوقف فوراً إن لم تُضبط المتغيرات على Render؛ اضبطها من لوحة Render
// (Settings ← Environment): JWT_SECRET (قيمة عشوائية طويلة) و ADMIN_WALLET (عنوان مدير Phantom).
const requireEnv = (name) => {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`Missing required env var: ${name}`);
    return v;
};
const JWT_SECRET = requireEnv("JWT_SECRET");
export const ADMIN_WALLET = requireEnv("ADMIN_WALLET");
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
    // 🎯 منح نقاط النشاط لإكمال جلسة التعدين (24 ساعة) — حسب مستوى المستخدم
    try {
        await awardActivity(userId, "xpMine");
    }
    catch (e) {
        console.error("mining activity error:", e);
    }
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
            if (!valid) {
                // 🧪 تشخيص فني: سبب الرفض الفعلي (فشل ed25519) لمعالجة الشكاوى بدقة
                console.warn(`[LOGIN] signature verify FAILED wallet=${walletAddress.slice(0, 6)}… ` +
                    `sigLen=${sigBytes.length} msgLen=${msgBytes.length} base64Ok=${signature !== ""}`);
                return res.status(401).json({ message: "توقيع غير صالح — تأكد أنك وقّعت بالمحفظة الصحيحة" });
            }
            // 🔒 تحقق من أن الرسالة تحوي الـ nonce الصحيح وغير منتهٍ
            const stored = challengeStore.get(walletAddress);
            if (!stored || stored.nonce !== nonce || stored.expires < Date.now()) {
                return res.status(401).json({ message: "انتهت صلاحية رمز التحدّي، أعد المحاولة" });
            }
            // 🚫 استعمال واحد فقط: حذف رمز التحدّي فور نجاح التحقق لمنع إعادة استخدام
            // طلب مسجَّل (replay attack) — أي محاولة لاحقة تتطلب تحدّياً جديداً.
            challengeStore.delete(walletAddress);
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
        // 🎯 منح نقاط النشاط لتسجيل الدخول (مرة واحدة يومياً) — يقيس نشاط الحساب
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const last = user.lastLoginActivityAt ? new Date(user.lastLoginActivityAt) : null;
            const lastDay = last ? new Date(last).setHours(0, 0, 0, 0) : 0;
            if (lastDay < today.getTime()) {
                await awardActivity(user.id, "xpLogin");
                await prisma.user.update({ where: { id: user.id }, data: { lastLoginActivityAt: new Date() } });
            }
        }
        catch (actErr) {
            console.error("login activity error:", actErr);
        }
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
        // 🛠️ تسجيل الخطأ الحقيقي في السيرفر فقط — لا نكشف تفاصيله الداخلية للمهاجم
        console.error("Login wallet error:", error);
        return res.status(500).json({ message: "تعذّر تسجيل الدخول حالياً، أعد المحاولة لاحقاً" });
    }
});
// ==========================================
// 💳 2. مسار تفعيل الحساب الصارم والتحقق الفعلي عبر البلوكشين (Solana RPC)
// ==========================================
// 🔍 استرجاع دفعة مؤهلة من البلوكشين: يفحص آخر تحويلات لمحفظة الموقع بحثاً عن
// تحويل مؤهَّل صادر من محفظة المستخدم بالمبلغ المطلوب. يُستخدم عند انقطاع التطبيق
// بعد بثّ الدفعة وقبل إكمال التفعيل — لتفادي دفع مزدوج.
const findEligiblePayment = async (solanaRpcUrl, userWallet, hasReferrer) => {
    const connection = new Connection(solanaRpcUrl, "confirmed");
    const s = getSettings();
    const minRequired = hasReferrer ? s.activationHalfLamports : s.activationFullLamports;
    try {
        const signatures = await connection.getSignaturesForAddress(new PublicKey(ADMIN_WALLET), { limit: 30 });
        for (const sig of signatures) {
            if (sig.err)
                continue;
            // 🔁 عزل التوقيع: خطأ استرجاع معاملة قديمة (expired / block height exceeded)
            // لا يُسقط الحلقة — نكمل فحص بقية التحويلات
            try {
                const tx = await connection.getTransaction(sig.signature, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0,
                });
                if (!tx || !tx.meta || tx.meta.err)
                    continue;
                const keys = tx.transaction.message.getAccountKeys();
                let adminIdx = -1;
                let fromIdx = -1;
                for (let i = 0; i < keys.length; i++) {
                    const addr = keys.get(i)?.toString();
                    if (addr === ADMIN_WALLET)
                        adminIdx = i;
                    if (addr === userWallet)
                        fromIdx = i;
                }
                if (adminIdx === -1 || fromIdx === -1)
                    continue;
                const adminDelta = tx.meta.postBalances[adminIdx] - tx.meta.preBalances[adminIdx];
                if (adminDelta >= minRequired)
                    return sig.signature;
            }
            catch (sigErr) {
                console.warn(`findEligiblePayment: skip signature ${sig.signature.slice(0, 8)}… (${sigErr?.message || "rpc error"})`);
                continue;
            }
        }
    }
    catch (err) {
        console.error("findEligiblePayment error:", err);
    }
    return null;
};
router.post("/activate-account", authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        let { txHash, referralCode } = req.body;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { referrer: true }
        });
        if (!user)
            return res.status(404).json({ message: "المستخدم غير موجود" });
        if (user.activationStatus === "active")
            return res.status(400).json({ message: "حسابك مفعّل مسبقاً!" });
        // 🔗 لصق كود إحالة أثناء إتمام الدفع: إن لم يكن للمستخدم محيل من قبل وأُلصق كود
        // صالح، نربطه به قبل التوثيق فيُحتسب التقسيم 0.015 + 0.015 ووصول حصة المحيل على البلوكشين.
        if (!user.referrerId && typeof referralCode === "string" && referralCode.trim()) {
            const code = referralCode.trim();
            const ref = await prisma.user.findUnique({ where: { referralCode: code } });
            if (ref && ref.id !== user.id && ref.walletAddress && ref.walletAddress !== ADMIN_WALLET) {
                await prisma.user.update({ where: { id: user.id }, data: { referrerId: ref.id } });
                user.referrerId = ref.id;
                user.referrer = ref;
            }
        }
        const solanaRpcUrl = process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.devnet.solana.com";
        if (!txHash) {
            // 🔍 الاسترجاع: التطبيق بُثّ الدفعة لكنه انقطع قبل إرسال التوثيق — ابحث لها على البلوكشين
            txHash = await findEligiblePayment(solanaRpcUrl, user.walletAddress, Boolean(user.referrerId));
            if (!txHash)
                return res.status(400).json({ message: "رمز توقيع المعاملة TxHash مطلوب للتوثيق!" });
        }
        try {
            // 🌐 استخدام الـ Endpoint الصحيح والمستقر من البيئة أو Devnet كاحتياطي
            const connection = new Connection(solanaRpcUrl, "confirmed");
            // 🔁 جلب المعاملة مع إعادة محاولة (لا يرمي error expired أبداً): devnet قد لا يُرجعها فوراً
            let txStatus = await fetchTransactionWithRetry(connection, txHash);
            if (!txStatus) {
                // 🔍 محاولة أخيرة: المستخدم أرسل توقيعاً قديماً/غير مدرج — ابحث عن أحدث دفعة بديلة
                const recovered = await findEligiblePayment(solanaRpcUrl, user.walletAddress, Boolean(user.referrerId));
                if (!recovered) {
                    return res.status(400).json({ message: "لم يتم العثور على المعاملة على البلوكشين بعد، أعد المحاولة خلال ثوانٍ" });
                }
                txHash = recovered;
                txStatus = await fetchTransactionWithRetry(connection, txHash);
                if (!txStatus) {
                    return res.status(400).json({ message: "لم يتم العثور على المعاملة على البلوكشين بعد، أعد المحاولة خلال ثوانٍ" });
                }
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
            // ✅ التحقق من وصول حصة محفظة الموقع (نصف رسوم التفعيل مع وجود إحالة، أو المبلغ الكامل بدونها)
            const adminReceived = receivedBy(ADMIN_WALLET);
            const feeCfg = getSettings();
            const minimumRequiredAmount = user.referrerId ? feeCfg.activationHalfLamports : feeCfg.activationFullLamports;
            if (adminReceived < minimumRequiredAmount) {
                return res.status(400).json({ message: "المبلغ المرسل غير كافٍ لتنشيط رسوم التفعيل" });
            }
            // 🛡️ التحقق الصارم من وصول الحصة الأخرى لنصف رسوم التفعيل إلى محفظة صاحب الإحالة الفعلي على البلوكشين
            if (user.referrerId && user.referrer?.walletAddress) {
                const referrerReceived = receivedBy(user.referrer.walletAddress);
                if (referrerReceived < feeCfg.activationHalfLamports) {
                    return res.status(400).json({
                        message: "احتيال: لم تصل حصة صاحب الإحالة إلى محفظته على البلوكشين!"
                    });
                }
            }
        }
        catch (blockchainError) {
            console.error("Solana verification breakdown:", blockchainError);
            return res.status(400).json({ message: "فشل السيرفر في التحقق من المعاملة عبر عقدة الـ RPC، حاول مجدداً" });
        }
        const feeCfg2 = getSettings();
        const siteShare = feeCfg2.siteShare;
        const referrerShare = user.referrerId ? feeCfg2.referrerShare : 0.0;
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
                await tx.payment.create({ data: { userId, amount: feeCfg2.activationFullLamports / 1e9, currency: "SOL", status: "paid", txHash: txHash } });
            }
        });
        // 🪙 مكافأة صاحب الإحالة: 10 عملات تُضاف لرصيده فور تفعيل المحالّ له بنجاح + نقاط نشاط
        const referrerId = user.referrerId;
        if (referrerId) {
            try {
                await prisma.$transaction(async (tx) => {
                    await tx.user.update({ where: { id: referrerId }, data: { balance: { increment: 10 } } });
                    await tx.reward.create({ data: { userId: referrerId, type: "referral_bonus", amount: 10, sourceUserId: userId } });
                });
                await awardActivity(referrerId, "xpRef");
            }
            catch (e) {
                console.error("referrer bonus error:", e);
            }
        }
        return res.json({ message: "تم تفعيل حسابك كمستخدم نشط بنجاح باهر عبر البلوكشين! 🎉", activationStatus: "active" });
    }
    catch (error) {
        return res.status(500).json({ message: "حدث خطأ داخلي أثناء معالجة تفعيل الحساب" });
    }
});
// 🔍 التحقق الفوري من كود إحالة أُلصق قبل إتمام الدفع: يعيد محفظة صاحبه
// ليستطيع التطبيق بناء المعاملة المقسّمة 0.015 + 0.015 قبل توقيعها.
router.post("/resolve-referral", authenticateJWT, async (req, res) => {
    try {
        const code = String(req.body?.referralCode || "").trim();
        if (!code)
            return res.status(400).json({ message: "أدخل كود الإحالة أولاً" });
        const referrer = await prisma.user.findUnique({
            where: { referralCode: code },
            select: { id: true, walletAddress: true }
        });
        if (!referrer)
            return res.status(400).json({ message: "كود الإحالة غير صحيح، تأكد منه وأعد المحاولة" });
        if (referrer.id === req.user.id)
            return res.status(400).json({ message: "لا يمكنك إدخال كود الإحالة الخاص بك!" });
        if (!referrer.walletAddress || referrer.walletAddress === ADMIN_WALLET) {
            return res.status(400).json({ message: "هذا الكود غير صالح للتقسيم حالياً" });
        }
        return res.json({ valid: true, walletAddress: referrer.walletAddress });
    }
    catch (e) {
        console.error("resolve-referral error:", e);
        return res.status(500).json({ message: "خطأ أثناء التحقق من الكود، أعد المحاولة" });
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
            const bonus = isPaid ? getSettings().referrerShare : 0.00;
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
        const currentRate = rateForLevel(user.currentLevel || 1);
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
        const currentRate = rateForLevel(user.currentLevel || 1);
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
        const feeSettings = getSettings();
        const rewardTable = feeSettings.dailyRewards.length ? feeSettings.dailyRewards : [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0];
        const baseReward = rewardTable[Math.min(currentStreak, rewardTable.length) - 1] ?? rewardTable[rewardTable.length - 1] ?? 1.0;
        const lvl = user.currentLevel || 1;
        const finalReward = Math.round(baseReward * (1 + (lvl - 1) * feeSettings.dailyLevelMult) * 1e6) / 1e6;
        await prisma.$transaction([
            prisma.dailyBonus.create({ data: { userId, streakDay: currentStreak, rewardAmount: finalReward, claimedAt: now } }),
            prisma.user.update({ where: { id: userId }, data: { balance: { increment: finalReward } } })
        ]);
        // 🎯 منح نقاط النشاط للمطالبة بالبونص اليومي (حسب مستوى المستخدم)
        await awardActivity(userId, "xpBonus");
        const updated = await prisma.user.findUnique({ where: { id: userId }, select: { currentLevel: true, currentXp: true } });
        return res.json({ message: `تمت المطالبة ببونص اليوم ${currentStreak} بنجاح! 🎉`, reward: finalReward, currentLevel: updated?.currentLevel || lvl, xpProgress: `${updated?.currentXp || 0}` });
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
        const [totalUsers, activeMiners, payments] = await Promise.all([
            prisma.user.count(),
            prisma.miningSession.count({ where: { status: "active" } }),
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
        return res.json({ totalUsers, activeMiners, totalRevenue });
    }
    catch (error) {
        console.error("Admin stats error:", error);
        return res.status(500).json({ message: "فشل السيرفر في معالجة طلب الإدارة الحية" });
    }
});
// ==========================================
// 🎁 7. مسارات توزيع جوائز التوكن (يدوياً من لوحة المدير)
// ==========================================
// 🪙 إعداد عقد التوكن: يُقرأ من إعدادات الموقع (ربط يدوي من لوحة المدير) مع تراجع لبيئة التشغيل (.env)
const getTokenConfig = () => {
    const s = getSettings();
    return {
        mint: (s.tokenMint || process.env.TOKEN_MINT || "").trim(),
        decimals: s.tokenDecimals || Number(process.env.TOKEN_DECIMALS || 9),
        network: (s.solanaNetwork || process.env.SOLANA_NETWORK || "devnet").trim(),
        treasury: (s.treasuryWallet || ADMIN_WALLET).trim(),
        name: (s.tokenName || process.env.TOKEN_NAME || s.tokenMint || "SOLKIT").trim(),
        symbol: (s.tokenSymbol || process.env.TOKEN_SYMBOL || "SOLKIT").trim(),
        icon: (s.tokenIcon || "").trim(),
    };
};
const getRpcUrlFor = (network) => process.env.SOLANA_RPC_URL ||
    process.env.RPC_URL ||
    (network === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
const getRpcUrl = () => getRpcUrlFor(getTokenConfig().network);
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
        // 🔁 إعادة محاولة جلب المعاملة: عقد devnet العامة تُباعد أحياناً في الفهرسة،
        // وخطأ old/expired يُعالج كأنه "غير مرئية بعد" ثم نحسم عبر رصيد الحساب الحالي.
        const txInfo = await fetchTransactionWithRetry(connection, signature);
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
// 🔁 جلب معاملة مع إعادة محاولة (لا يرمي خطأ expired أبداً — يرجّع null كي يقرّر المتصل)
const fetchTransactionWithRetry = async (connection, signature, attempts = 5, delayMs = 2500) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const tx = await connection.getTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });
            if (tx)
                return tx;
        }
        catch (err) {
            const msg = err?.message || "";
            if (!/expired|block he?ight exceeded/i.test(msg)) {
                // خطأ غير متوقع — نحتفظ به لأول محاولة فقط، ثم نكمل
                if (attempt === 0)
                    console.warn(`fetchTransactionWithRetry (${signature.slice(0, 8)}…): ${msg}`);
            }
        }
        await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
};
// أ. نظرة عامة على الأرصدة المجمعة وحالة التوكن
router.get("/admin/distribution/overview", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const cfg = getTokenConfig();
        const connection = new Connection(getRpcUrl(), "confirmed");
        const configured = Boolean(cfg.mint);
        let treasuryBalance = 0;
        if (configured) {
            treasuryBalance = await getTreasuryTokenBalance(connection, new PublicKey(cfg.mint), new PublicKey(cfg.treasury));
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
            mint: cfg.mint || null,
            decimals: cfg.decimals,
            network: cfg.network,
            treasuryWallet: cfg.treasury,
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
        const rawPct = Number(req.query.percentage || 100);
        const pct = Math.min(100, Math.max(1, Number.isFinite(rawPct) ? rawPct : 100)) / 100;
        const cfg = getTokenConfig();
        if (!cfg.mint)
            return res.status(400).json({ message: "لم يتم ربط عقد التوكن بعد — اربطه من تبويب «ربط عقد التوكن»" });
        const connection = new Connection(getRpcUrl(), "confirmed");
        const mint = new PublicKey(cfg.mint);
        const treasury = new PublicKey(cfg.treasury);
        const treasuryBalance = await getTreasuryTokenBalance(connection, mint, treasury);
        // رصيد المجمع = مجموع أرصدة المشتركين النشطين (تُجمع من المهام والتعدين والألعاب والبونص)
        const poolUsers = await prisma.user.findMany({
            where: { activationStatus: "active", walletAddress: { not: null }, balance: { gt: 0 } },
            select: { id: true, walletAddress: true, currentLevel: true, balance: true }
        });
        const fullPool = poolUsers.reduce((s, u) => s + Number(u.balance), 0);
        const pool = fullPool * pct; // رصيد المجمع المراد توزيعه حسب النسبة المختارة
        if (fullPool <= 0)
            return res.status(400).json({ message: "رصيد المجمع صفر — لا توجد أرصدة متراكمة بعد" });
        if (treasuryBalance < pool) {
            return res.status(400).json({
                message: `رصيد خزانة التوكن (${treasuryBalance.toFixed(2)}) أقل من رصيد المجمع المطلوب توزيعه (${pool.toFixed(2)}) — امنح التوكن للخزانة أولاً`
            });
        }
        // توزيع نسبي: كل مشترك يستلم حصته = رصيده الحالي × النسبة المختارة
        const recipients = [];
        for (const u of poolUsers) {
            const amount = Math.floor(Number(u.balance) * pct * 1e8) / 1e8; // تقريب لـ 8 خانات دون تجاوز
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
            mint: cfg.mint,
            decimals: cfg.decimals,
            network: cfg.network,
            pool,
            fullPool,
            requestedPercentage: Math.round(pct * 100),
            treasuryWallet: cfg.treasury,
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
        const cfg = getTokenConfig();
        if (!cfg.mint)
            return res.status(400).json({ message: "لم يتم ربط عقد التوكن بعد" });
        const parsed = confirmDistributionSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة بيانات التوزيع غير سليمة" });
        const { recipients } = parsed.data;
        const connection = new Connection(getRpcUrl(), "confirmed");
        const mint = new PublicKey(cfg.mint);
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
                // 🔄 خصم الرصيد الموزَّع من حساب المشترك بعد استلام حصته — مع الحفاظ على مستوى الحساب والخبرة وتقدّم الألعاب
                await tx.user.update({
                    where: { id: r.userId },
                    data: { balance: { decrement: r.amount } }
                });
            }
            return b;
        });
        return res.json({
            message: "تم توزيع رصيد المجمع وتحديث الأرصدة بنجاح 🎉",
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
        const cfg = getTokenConfig();
        return res.json({
            maintenanceMode: s.maintenanceMode,
            maintenanceMessage: s.maintenanceMessage,
            tgeTarget: s.tgeTarget,
            tokenMint: cfg.mint,
            tokenDecimals: cfg.decimals,
            solanaNetwork: cfg.network,
            treasuryWallet: cfg.treasury,
            projectName: s.projectName || "SOLKIT",
            tokenName: cfg.name,
            tokenSymbol: cfg.symbol,
            tokenIcon: cfg.icon,
            levelPlan: getLevelPlan(),
            dailyRewards: s.dailyRewards || [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0],
            dailyLevelMult: s.dailyLevelMult ?? 0.05,
            activationFullLamports: s.activationFullLamports || 30000000,
            activationHalfLamports: s.activationHalfLamports || 15000000,
            siteShare: s.siteShare ?? 0.015,
            referrerShare: s.referrerShare ?? 0.015,
            xpLogin: s.xpLogin ?? 10,
            xpTask: s.xpTask ?? 25,
            xpGame: s.xpGame ?? 5,
            xpRef: s.xpRef ?? 50,
            xpMine: s.xpMine ?? 30,
            xpBonus: s.xpBonus ?? 15,
        });
    }
    catch (error) {
        console.error("GET /settings error:", error);
        return res.status(500).json({ message: "Error" });
    }
});
// 🎯 مسار المستويات العام: خطة المستويات التسعة + أعلى 50 حساباً نشاطاً (لوحة القادة)
router.get("/levels", async (_req, res) => {
    try {
        const plan = getLevelPlan();
        const leaderboard = await prisma.user.findMany({
            orderBy: { currentXp: "desc" },
            take: 50,
            select: { id: true, walletAddress: true, currentLevel: true, currentXp: true, activationStatus: true },
        });
        return res.json({ plan, leaderboard });
    }
    catch (error) {
        console.error("GET /levels error:", error);
        return res.status(500).json({ message: "Error" });
    }
});
// ⚙️ تحديث الإعدادات — للمدير فقط
const settingsSchema = z.object({
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().min(1).max(300).optional(),
    tgeTarget: z.number().int().min(0).optional(),
    tokenMint: z.string().max(60).optional(),
    tokenDecimals: z.number().int().min(0).max(9).optional(),
    solanaNetwork: z.enum(["devnet", "mainnet-beta"]).optional(),
    treasuryWallet: z.string().max(60).optional(),
    projectName: z.string().min(1).max(40).optional(),
    tokenName: z.string().min(1).max(40).optional(),
    tokenSymbol: z.string().min(1).max(20).optional(),
    tokenIcon: z.string().max(2500000).refine((v) => !v || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(v), "يجب أن تكون الأيقونة رابط بيانات صورة base64 صالحاً").optional(),
    levelPlan: z.array(z.object({
        level: z.number().int().min(1).max(9),
        name: z.string().min(1).max(40),
        minXp: z.number().int().min(0),
        color: z.string().min(4).max(20),
        miningRate: z.number().min(0),
        xpLogin: z.number().int().min(0).max(100000).optional(),
        xpTask: z.number().int().min(0).max(100000).optional(),
        xpGame: z.number().int().min(0).max(100000).optional(),
        xpRef: z.number().int().min(0).max(100000).optional(),
        xpMine: z.number().int().min(0).max(100000).optional(),
        xpBonus: z.number().int().min(0).max(100000).optional(),
    })).optional(),
    dailyRewards: z.array(z.number().min(0).max(1000000)).min(1).max(31).optional(),
    dailyLevelMult: z.number().min(0).max(1).optional(),
    activationFullLamports: z.number().int().min(1000000).max(1000000000000).optional(),
    activationHalfLamports: z.number().int().min(1000000).max(1000000000000).optional(),
    siteShare: z.number().min(0).max(1).optional(),
    referrerShare: z.number().min(0).max(1).optional(),
    xpLogin: z.number().int().min(0).max(100000).optional(),
    xpTask: z.number().int().min(0).max(100000).optional(),
    xpGame: z.number().int().min(0).max(100000).optional(),
    xpRef: z.number().int().min(0).max(100000).optional(),
    xpMine: z.number().int().min(0).max(100000).optional(),
    xpBonus: z.number().int().min(0).max(100000).optional(),
});
router.post("/admin/settings", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const parsed = settingsSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: "صيغة الإعدادات غير صالحة" });
        const updated = updateSettings(parsed.data);
        const cfg = getTokenConfig();
        return res.json({
            message: "تم حفظ الإعدادات بنجاح ✅",
            maintenanceMode: updated.maintenanceMode,
            maintenanceMessage: updated.maintenanceMessage,
            tgeTarget: updated.tgeTarget,
            tokenMint: cfg.mint,
            tokenDecimals: cfg.decimals,
            solanaNetwork: cfg.network,
            treasuryWallet: cfg.treasury,
            projectName: updated.projectName || "SOLKIT",
            tokenName: cfg.name,
            tokenSymbol: cfg.symbol,
            tokenIcon: cfg.icon,
            levelPlan: getLevelPlan(),
            dailyRewards: updated.dailyRewards || [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 10.0],
            dailyLevelMult: updated.dailyLevelMult ?? 0.05,
            activationFullLamports: updated.activationFullLamports || 30000000,
            activationHalfLamports: updated.activationHalfLamports || 15000000,
            siteShare: updated.siteShare ?? 0.015,
            referrerShare: updated.referrerShare ?? 0.015,
            xpLogin: updated.xpLogin ?? 10,
            xpTask: updated.xpTask ?? 25,
            xpGame: updated.xpGame ?? 5,
            xpRef: updated.xpRef ?? 50,
            xpMine: updated.xpMine ?? 30,
            xpBonus: updated.xpBonus ?? 15,
        });
    }
    catch (error) {
        console.error("Update settings error:", error);
        return res.status(500).json({ message: "فشل حفظ الإعدادات" });
    }
});
// 🧹 تصفير تقدم المستويات: يعيد جميع المستخدمين للمستوى 1 (نقاط النشاط صفر)
// 💰 الأرصدة والتفعيل والمدفوعات لا تتأثر إطلاقاً
router.post("/admin/reset-levels", authenticateJWT, async (req, res) => {
    try {
        if (!isAdmin(req, res))
            return;
        const result = await prisma.user.updateMany({
            data: {
                currentXp: 0,
                currentLevel: 1,
                xpLoginEarned: 0,
                xpTaskEarned: 0,
                xpGameEarned: 0,
                xpRefEarned: 0,
                xpMineEarned: 0,
                xpBonusEarned: 0,
            },
        });
        return res.json({ message: `تم تصفير تقدم المستويات — إعادة ${result.count} حساباً للمستوى 1 ✅`, count: result.count });
    }
    catch (error) {
        console.error("Reset levels error:", error);
        return res.status(500).json({ message: "فشل تصفير تقدم المستويات" });
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
