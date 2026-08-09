import { Router } from "express";
const router = Router();
// مسار لجلب كود الإحالة، إجمالي الإحالات النشطة وغير النشطة وقائمة الأعضاء
router.get("/network", (req, res) => res.json({ message: "Referral network data" }));
export default router;
