import "dotenv/config";
import express from "express";
import cors from "cors";
import dashboardRoutes from "./routes/dashboard";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
}));

app.use(express.json());
app.use("/api", dashboardRoutes);

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});