import dotenv from "dotenv";
dotenv.config();
export const env = {
    port: Number(process.env.PORT || 4000),
    databaseUrl: process.env.DATABASE_URL || "",
    clientUrl: process.env.CLIENT_URL || "",
    jwtSecret: process.env.JWT_SECRET || "secret",
};
