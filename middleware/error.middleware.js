// ============================================================
//  middleware/error.middleware.js — Global Error Handler
//
//  WHY: Express's built-in error handling is minimal. By
//  centralising error responses here we get consistent JSON
//  error shapes across the entire API — the frontend always
//  knows what shape an error response will take.
// ============================================================

/**
 * Express error-handling middleware.
 * Signature must have exactly 4 params so Express recognises it.
 *
 * @param {Error}  err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const errorHandler = (err, _req, res, _next) => {
  console.error("❌  Error:", err.message);

  // Multer-specific errors (file size, wrong type, etc.)
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: "File too large. Maximum size is 10 MB.",
    });
  }

  // Generic fallback — never expose a raw stack trace to clients
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || "An unexpected server error occurred.",
  });
};