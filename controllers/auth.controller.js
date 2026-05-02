// ============================================================
//  controllers/auth.controller.js — Authentication Logic
//
//  Handles: register, login, getMe, forgotPassword, resetPassword
//
//  WHY this structure:
//   • register: creates user, sends welcome email, returns JWT
//   • login: verifies credentials, returns JWT + public profile
//   • getMe: returns current user from req.user (set by protect middleware)
//   • forgotPassword: generates reset token, emails link
//   • resetPassword: validates token, sets new password, returns new JWT
// ============================================================

import crypto from "crypto";
import User from "../models/User.js";
import { signToken } from "../middleware/auth.middleware.js";
import { sendPasswordResetEmail, sendWelcomeEmail } from "../utils/email.js";

// ── Register ──────────────────────────────────────────────────
export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "Name, email, and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters." });
    }

    // Check duplicate email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, error: "An account with this email already exists." });
    }

    // Create user
    const user = new User({ name, email });
    await user.setPassword(password);
    await user.save();

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendWelcomeEmail(email, name).catch((err) =>
      console.warn("⚠️  Welcome email failed:", err.message)
    );

    // Return JWT + profile
    const token = signToken(user._id);
    res.status(201).json({
      success: true,
      token,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
}

// ── Login ─────────────────────────────────────────────────────
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    // Select passwordHash explicitly (it has select:false in schema)
    const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
    if (!user) {
      // Generic message — don't reveal whether the email exists
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    const token = signToken(user._id);
    res.json({
      success: true,
      token,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
}

// ── Get Current User ──────────────────────────────────────────
export async function getMe(req, res) {
  // req.user is already set by protect middleware
  res.json({ success: true, user: req.user.toPublicJSON() });
}

// ── Forgot Password ───────────────────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // ALWAYS respond with success — never reveal if email is registered
    if (!user) {
      return res.json({
        success: true,
        message: "If that email is registered, a reset link has been sent.",
      });
    }

    // Generate a secure random token (hex string)
    const rawToken = crypto.randomBytes(32).toString("hex");
    // Store hashed version in DB — raw token goes in the email link
    user.passwordResetToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    // Send email with raw token embedded in URL
    await sendPasswordResetEmail(email, rawToken);

    res.json({
      success: true,
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
}

// ── Reset Password ────────────────────────────────────────────
export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, error: "Token and new password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters." });
    }

    // Hash the incoming token and find the matching user
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }, // Token must not be expired
    }).select("+passwordHash +passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(400).json({ success: false, error: "Reset link is invalid or has expired." });
    }

    // Set new password and clear reset fields
    await user.setPassword(password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Auto-login: return a fresh JWT
    const newToken = signToken(user._id);
    res.json({
      success: true,
      token: newToken,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
}