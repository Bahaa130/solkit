import { Router } from "express";

const router = Router();

// مسار لطلب سحب الأرباح إلى محفظة Solana
router.post("/request", (req, res) => res.json({ message: "Withdrawal requested" })); 
// مسار لجلب سجل السحوبات السابقة للمستخدم والتاريخ والحالة
router.get("/history", (req, res) => res.json({ message: "Withdrawal history" })); 

export default router;

