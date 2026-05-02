// ============================================================
//  utils/db.js — MongoDB Connection via Mongoose
//
//  WHY: Centralising the DB connection here means server.js
//  stays clean. We export a single connect() function that
//  server.js calls on boot. Mongoose handles connection pooling
//  and automatic reconnection internally.
// ============================================================

import mongoose from "mongoose";

/**
 * Opens the MongoDB connection using MONGODB_URI from .env.
 * Logs success or exits the process on failure — a DB-less
 * server is useless, so we fail fast.
 */
export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Mongoose 8 no longer needs these flags, but kept for clarity
    });
    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌  MongoDB connection failed: ${err.message}`);
    process.exit(1); // Crash fast — nothing works without DB
  }
}