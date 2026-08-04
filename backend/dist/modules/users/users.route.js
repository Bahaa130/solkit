"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../../config/prisma");
const router = (0, express_1.Router)();
function generateReferralCode() {
    return crypto_1.default.randomBytes(4).toString("hex");
}
router.get("/", async (_req, res) => {
    const users = await prisma_1.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    });
    res.json(users);
});
router.get("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const user = await prisma_1.prisma.user.findUnique({
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
    const user = await prisma_1.prisma.user.create({
        data: {
            email,
            walletAddress: walletAddress || null,
            referralCode: generateReferralCode(),
            referrerId: referrerId || null,
        },
    });
    res.status(201).json(user);
});
exports.default = router;
