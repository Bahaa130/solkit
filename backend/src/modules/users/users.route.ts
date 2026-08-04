import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../../../config/prisma";

const router = Router();

function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  res.json(users);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      referrer: true,
      referrals: true,
      wallets: true,
      rewards: true,
      payments: true,
    },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json(user);
});

router.post("/", async (req, res) => {
  const { email, walletAddress, referrerId } = req.body;

  const user = await prisma.user.create({
    data: {
      email,
      walletAddress: walletAddress || null,
      referralCode: generateReferralCode(),
      referrerId: referrerId || null,
    },
  });

  res.status(201).json(user);
});

export default router;