// index.ts //
import { Router } from "express";
import healthRoute from "../modules/health/health.route.js";
import usersRoute from "../modules/users/users.route.js";
import miningRoute from "../modules/mining/mining.route.js";
import referralRoute from "../modules/referral/referral.route.js";
import tasksRoute from "../modules/tasks/tasks.route.js";
import bonusRoute from "../modules/bonus/bonus.route.js";
import solanaRoute from "../modules/solana/solana.route.js";

const router = Router();

router.use("/health", healthRoute);
router.use("/users", usersRoute);
router.use("/mining", miningRoute);        // صفحة عداد التعدين
router.use("/referral", referralRoute);    // صفحة شبكة الإحالة
router.use("/tasks", tasksRoute);          // صفحة هدايا الاشتراك والمهمات
router.use("/bonus", bonusRoute);          // صفحة البونص اليومي والمستويات
router.use("/solana", solanaRoute);        // 🔀 بروكسي Solana RPC (يتجاوز قيود CORS)

export default router;