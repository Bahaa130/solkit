"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const health_route_1 = __importDefault(require("../modules/health/health.route"));
const users_route_1 = __importDefault(require("../modules/users/users.route"));
const router = (0, express_1.Router)();
router.use("/health", health_route_1.default);
router.use("/users", users_route_1.default);
exports.default = router;
