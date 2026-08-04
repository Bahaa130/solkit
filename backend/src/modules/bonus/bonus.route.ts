import { Router } from "express";

const router = Router();

// مسار للمطالبة بالبونص اليومي (الـ Check-in) وحساب الـ Streak والمستويات
router.post("/claim-daily", (req, res) => res.json({ message: "Daily bonus claimed" })); 
// مسار لجلب مستوى المستخدم الحالي ونقاط الخبرة (XP) المتبقية للمستوى التالي
router.get("/tier-status", (req, res) => res.json({ message: "Tier and XP status" })); 

export default router;
