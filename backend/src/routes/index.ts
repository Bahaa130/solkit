// index.ts //
import { Router } from "express";
import healthRoute from "../modules/health/health.route";
import usersRoute from "../modules/users/users.route";
import miningRoute from "../modules/mining/mining.route";
import withdrawalRoute from "../modules/withdrawal/withdrawal.route";
import referralRoute from "../modules/referral/referral.route";
import tasksRoute from "../modules/tasks/tasks.route";
import bonusRoute from "../modules/bonus/bonus.route";

const router = Router();

router.use("/health", healthRoute);
router.use("/users", usersRoute);
router.use("/mining", miningRoute);        // صفحة عداد التعدين
router.use("/withdrawal", withdrawalRoute);  // صفحة سحب الأرباح (سولانا)
router.use("/referral", referralRoute);    // صفحة شبكة الإحالة
router.use("/tasks", tasksRoute);          // صفحة هدايا الاشتراك والمهمات
router.use("/bonus", bonusRoute);          // صفحة البونص اليومي والمستويات

export default router;