import { Router } from "express";
const router = Router();
// مسار لجلب قائمة المهام الاجتماعية وحالة كل مهمة (مكتملة أو مغلقة)
router.get("/list", (req, res) => res.json({ message: "Social tasks list" }));
// مسار للتحقق من مهمة معينة (تليجرام أو X) وتوزيع الهدية
router.post("/verify/:taskName", (req, res) => res.json({ message: "Task verification" }));
export default router;
