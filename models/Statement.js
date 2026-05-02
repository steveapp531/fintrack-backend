// ============================================================
//  models/Statement.js — Mongoose Statement Schema
//
//  WHY: Persisting analysed statements to MongoDB means:
//   1. Users can revisit past analyses without re-uploading
//   2. We can compute the real global "statements analysed"
//      counter shown on the landing page
//   3. Monthly dashboard can load from DB instead of re-running AI
// ============================================================

import mongoose from "mongoose";

// ── Transaction Sub-Schema ────────────────────────────────────
// Each statement contains an array of these
const transactionSchema = new mongoose.Schema(
  {
    date: { type: String },          // ISO date string "YYYY-MM-DD"
    description: { type: String },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["income", "expense"], required: true },
    category: { type: String, required: true },
  },
  { _id: false } // Don't create _id for every transaction — saves space
);

// ── Monthly Trend Sub-Schema ──────────────────────────────────
const monthlyTrendSchema = new mongoose.Schema(
  {
    month: String,     // e.g. "Mar 2024"
    income: Number,
    expenses: Number,
    profit: Number,
  },
  { _id: false }
);

// ── Statement Schema ──────────────────────────────────────────
const statementSchema = new mongoose.Schema(
  {
    // Which user uploaded this
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Original filename for display
    filename: { type: String, required: true },

    // All AI-extracted transactions
    transactions: [transactionSchema],

    // Pre-computed summary — stored so dashboard renders instantly
    summary: {
      totalIncome: Number,
      totalExpenses: Number,
      netProfit: Number,
      profitMargin: Number,
      transactionCount: Number,
      monthlyTrends: [monthlyTrendSchema],
      categoryBreakdown: [mongoose.Schema.Types.Mixed],
    },

    // AI recommendation
    recommendation: {
      status: { type: String, enum: ["healthy", "warning", "critical"] },
      message: String,
      tips: [String],
    },

    // Date range this statement covers (derived from transactions)
    periodStart: { type: String }, // "YYYY-MM"
    periodEnd: { type: String },   // "YYYY-MM"
  },
  {
    timestamps: true, // createdAt = upload date
  }
);

// ── Static: Global count for landing page counter ─────────────
statementSchema.statics.getGlobalCount = async function () {
  return this.countDocuments();
};

export default mongoose.model("Statement", statementSchema);