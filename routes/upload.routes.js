// routes/upload.routes.js — Upload Endpoints (Protected in v2)
import { Router } from "express";
import { uploadMiddleware } from "../middleware/upload.middleware.js";
import { processFile, getStatementHistory, getStatement } from "../controllers/upload.controller.js";
import { protect, requireFullAccess } from "../middleware/auth.middleware.js";

const router = Router();
router.use(protect);
router.post("/", requireFullAccess, uploadMiddleware, processFile);
router.get("/history", getStatementHistory);
router.get("/:id", getStatement);
export default router;