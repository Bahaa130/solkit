import { Router } from "express";
import healthRoute from "../modules/health/health.route";
import usersRoute from "../modules/users/users.route";

const router = Router();

router.use("/health", healthRoute);
router.use("/users", usersRoute);

export default router;

