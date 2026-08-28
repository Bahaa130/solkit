import dotenv from "dotenv";
dotenv.config();
// 🔐 سياسة إغلاق آمن (fail-closed): إن لم تُضبط JWT_SECRET يتوقف الخادم فوراً بدل
// استعمال مفتاح عام معروف في مستودع مفتوح — أي بديل ثابت يُحدِث ثغرة تزوير توكنات.
const requireEnv = (name) => {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`Missing required env var: ${name}`);
    return v;
};
export const env = {
    port: Number(process.env.PORT || 4000),
    databaseUrl: process.env.DATABASE_URL || "",
    clientUrl: process.env.CLIENT_URL || "",
    jwtSecret: requireEnv("JWT_SECRET"),
    adminWallet: requireEnv("ADMIN_WALLET"),
};
