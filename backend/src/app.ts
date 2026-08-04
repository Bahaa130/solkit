import express from "express";
import router from "./routes";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.send("API is running");
});

app.use("/api", router);

export default app;