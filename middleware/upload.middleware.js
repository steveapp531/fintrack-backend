// ============================================================
//  middleware/upload.middleware.js — Multer Configuration
//
//  WHY: Multer handles multipart/form-data (file uploads).
//  We configure it here — not in the controller — so that
//  storage strategy, file size limits, and MIME filtering are
//  all in one place and trivially swappable (e.g. swap disk
//  storage for S3 memoryStorage later without touching routes).
// ============================================================

import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the uploads directory exists at startup
const UPLOADS_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Storage Engine ──────────────────────────────────────────
// diskStorage saves the file to disk so pdf-parse / csv-parse
// can read it by file path. For a pure cloud deploy you would
// switch to memoryStorage() and work with req.file.buffer.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Prefix with timestamp to prevent name collisions
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// ── File Filter ─────────────────────────────────────────────
// Reject anything that isn't a PDF or CSV before it hits disk.
const fileFilter = (_req, file, cb) => {
  const allowedMimes = ["application/pdf", "text/csv", "text/plain"];
  const allowedExts = [".pdf", ".csv"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true); // accept
  } else {
    cb(
      new Error("Invalid file type. Only PDF and CSV bank statements are accepted."),
      false
    );
  }
};

// ── Multer Instance ─────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max — typical bank statement size
  },
});

// Export as middleware that expects a single file field named "file"
export const uploadMiddleware = upload.single("file");