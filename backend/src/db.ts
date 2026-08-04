import "dotenv/config";
import mysql from "mysql2/promise";

const url = new URL(process.env.DATABASE_URL as string);

export const db = mysql.createPool({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace("/", ""),
});