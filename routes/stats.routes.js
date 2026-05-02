// ============================================================
//  routes/stats.routes.js — Public Platform Stats
// ============================================================

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPublicStats } from "../controllers/stats.controller.js";

const router = Router();

const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: "Too many requests." },
});

// GET /api/stats/public — no auth required
router.get("/public", statsLimiter, getPublicStats);

export default router;