// ============================================================
//  server.js — FinTrack Express Entry Point v2
//
//  Changes from v1:
//   • Connects to MongoDB on boot via connectDB()
//   • Mounts auth routes: POST /api/auth/*
//   • Mounts stats routes: GET /api/stats/public
//   • Upload routes now require JWT (handled inside the route)
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./utils/db.js";
import authRoutes from "./routes/auth.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ── Connect to MongoDB first ────────────────────────────────
await connectDB();

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", message: "FinTrack API v2 running" })
);
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/stats", statsRoutes);

// ── Global Error Handler ─────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀  FinTrack API v2 running at http://localhost:${PORT}`);
  console.log(`    Auth:    /api/auth/register | /api/auth/login`);
  console.log(`    Upload:  /api/upload  (JWT required)`);
  console.log(`    Stats:   /api/stats/public\n`);
});

export default app;