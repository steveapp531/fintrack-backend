// ============================================================
//  models/User.js — Mongoose User Schema
//
//  WHY: The User model is the foundation of auth and access
//  control. We bake subscription logic directly into the schema
//  as virtuals and methods — the controller never has to
//  duplicate date arithmetic.
//
//  Fields:
//    Core:         name, email, passwordHash
//    Auth:         passwordResetToken, passwordResetExpires
//    Trial:        trialStartedAt, trialEndsAt (14 days)
//    Subscription: plan, subscriptionStatus, subscriptionEndsAt
//    Stats:        statementsAnalysed (incremented on each upload)
// ============================================================

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const TRIAL_DAYS = 14;
const GRACE_DAYS = 3;

const userSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [80, "Name too long"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Invalid email format"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Never returned in queries by default
    },

    // ── Password Reset ────────────────────────────────────────
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // ── Trial ─────────────────────────────────────────────────
    trialStartedAt: {
      type: Date,
      default: Date.now,
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    },

    // ── Subscription ──────────────────────────────────────────
    // plan: "none" | "quarterly" | "annual"
    plan: { type: String, enum: ["none", "quarterly", "annual"], default: "none" },
    // status: "trial" | "active" | "grace" | "expired"
    subscriptionStatus: {
      type: String,
      enum: ["trial", "active", "grace", "expired"],
      default: "trial",
    },
    subscriptionEndsAt: { type: Date, default: null },

    // ── Usage Stats (real counter for landing page) ───────────
    statementsAnalysed: { type: Number, default: 0 },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ passwordResetToken: 1 });

// ── Instance Methods ──────────────────────────────────────────

/**
 * Hashes and sets the password. Call before save().
 * @param {string} plainPassword
 */
userSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, 12);
};

/**
 * Compares a plain password against the stored hash.
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * Computes the current access level based on trial / subscription dates.
 * Call this any time you need to check what the user can do.
 *
 * Returns: "full" | "readonly" | "blocked"
 */
userSchema.methods.getAccessLevel = function () {
  const now = new Date();

  // Active paid subscription
  if (
    this.subscriptionStatus === "active" &&
    this.subscriptionEndsAt &&
    this.subscriptionEndsAt > now
  ) {
    return "full";
  }

  // Within trial period
  if (this.subscriptionStatus === "trial" && this.trialEndsAt > now) {
    return "full";
  }

  // Grace period (3 days after subscription/trial ends)
  const trialGrace = new Date(this.trialEndsAt);
  trialGrace.setDate(trialGrace.getDate() + GRACE_DAYS);
  const subGrace = this.subscriptionEndsAt
    ? new Date(this.subscriptionEndsAt)
    : null;
  if (subGrace) subGrace.setDate(subGrace.getDate() + GRACE_DAYS);

  if (now <= trialGrace || (subGrace && now <= subGrace)) {
    return "readonly";
  }

  return "blocked";
};

/**
 * Returns a safe public profile (no password, no reset token).
 */
userSchema.methods.toPublicJSON = function () {
  const accessLevel = this.getAccessLevel();
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    plan: this.plan,
    subscriptionStatus: this.subscriptionStatus,
    trialEndsAt: this.trialEndsAt,
    subscriptionEndsAt: this.subscriptionEndsAt,
    statementsAnalysed: this.statementsAnalysed,
    accessLevel,
    createdAt: this.createdAt,
  };
};

export default mongoose.model("User", userSchema);