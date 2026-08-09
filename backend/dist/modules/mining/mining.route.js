import { Router } from "express";
// سنقوم بإنشاء الـ controller لاحقاً
// import { startMining, getMiningStatus } from "./mining.controller"; 
const router = Router();
// مسار لبدء دورة تعدين جديدة (24 ساعة)
router.post("/start", (req, res) => res.json({ message: "Mining started" }));
// مسار لجلب حالة العداد التنازلي الحالية والرصيد المحدث
router.get("/status", (req, res) => res.json({ message: "Mining status" }));
export default router;
