import { Router } from "express";
import { db } from "../db";

const router = Router();

router.get("/dashboard", async (_req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, email, walletAddress, referralCode, referrerId, createdAt, updatedAt FROM `User` ORDER BY id DESC"
    );

    res.json(rows);
  } catch (error) {
    console.error("DB fetch error:", error);
    res.status(500).json({ message: "Failed to fetch data" });
  }
});

export default router;