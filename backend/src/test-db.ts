import { db } from "./db";

async function testConnection() {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    console.log("Database connected successfully:", rows);
  } catch (error) {
    console.error("Database connection failed:", error);
  } finally {
    process.exit();
  }
}

testConnection();