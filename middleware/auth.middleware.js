// ============================================================
//  middleware/auth.middleware.js — JWT Authentication Guard
//
//  WHY: Any route that requires a logged-in user runs this
//  middleware first. It reads the Bearer token, verifies it,
//  loads the user from DB, and attaches them to req.user.
//  Controllers then simply trust req.user is valid.
// ============================================================

import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Protects routes — must be logged in with a valid JWT.
 */
export async function protect(req, res, next) {
  // 1. Extract token from Authorization header
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Not authenticated. Please log in." });
  }

  const token = header.split(" ")[1];

  // 2. Verify signature and expiry
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, error: "Session expired. Please log in again." });
  }

  // 3. Load user from DB — ensures they still exist and account is active
  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(401).json({ success: false, error: "User no longer exists." });
  }

  // 4. Check access level — block fully expired accounts from write operations
  const accessLevel = user.getAccessLevel();
  req.userAccessLevel = accessLevel; // Controllers can inspect this

  // 5. Attach user to request — all downstream middleware/controllers can read it
  req.user = user;
  next();
}

/**
 * Blocks requests when the user's access is fully revoked.
 * Use AFTER protect() on routes that modify data.
 */
export function requireFullAccess(req, res, next) {
  if (req.userAccessLevel === "blocked") {
    return res.status(403).json({
      success: false,
      error: "Your subscription has expired. Please renew to continue.",
      accessLevel: "blocked",
    });
  }
  next();
}

/**
 * Helper: sign a JWT for a user ID.
 * @param {string} userId
 * @returns {string} signed token
 */
export function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}